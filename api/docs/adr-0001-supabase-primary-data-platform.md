# ADR-0001: Use Supabase Postgres as the primary data platform

**Status:** Accepted for the Track 01 hackathon build
**Date:** 29 August 2026
**Deciders:** Project team

## Context

This project delegates a limited purchase action to an agent. The Node.js transaction service must remain the only authority able to create or revoke a mandate, reserve spend, invoke a payment adapter, and append audit evidence. Python workers can research and assess risk, but cannot make an authorization decision or write privileged payment state.

The data platform therefore needs to support these invariants:

1. A purchase attempt checks the current mandate version, agent identity, revocation status, scope, expiry, available amount, and idempotency key before it reserves money.
2. The reservation and pending audit record are one atomic state transition. A payment-provider call occurs only after that transition commits.
3. Buyer, merchant, and auditor interfaces read projections. They cannot become a second authorization path.
4. Browser clients never receive a Stripe secret, a Supabase secret or service-role key, raw card data, or a privileged mandate-write capability.
5. Authentication, durable relational state, protected evidence storage, and access control must be practical to build in the hackathon window.

These are the existing Track 01 architecture constraints, not a claim that live marketplace settlement is ready.[^track01][^runbook]

## Decision drivers

- Atomic, auditable state transitions for mandate and payment-attempt records.
- Relational queries across mandates, agents, purchase attempts, receipts, risk assessments, disputes, and audit events.
- Strong browser-data isolation without trusting the browser to enforce policy.
- A low-operations path for Auth, Postgres, and protected storage.
- A clean server-only boundary for the Node transaction service.
- A path to move to standalone Postgres if requirements outgrow the hosted platform.

## Options considered

| Option | Fit | Reasoning |
| --- | --- | --- |
| Supabase: Postgres, Auth, Storage, RLS | Selected | PostgreSQL fits the relational audit model. Auth and Storage remove separate services. Row Level Security can protect user-facing projections, while Node keeps privileged mutation and payment paths server-side. |
| Firebase: Auth and Cloud Firestore | Not selected | Firestore transactions are atomic and retry on conflicting writes, so Firebase is viable. Its document model makes relationship-heavy audit queries and integrity rules more application-managed. Transaction callbacks can retry, so provider calls must never run inside them. That is an avoidable sharp edge for payment authorization. |
| Managed Postgres plus separate Auth and Storage | Deferred alternative | A provider such as Neon plus separate identity and storage services offers more provider independence, but requires the team to integrate and secure more components. It is a credible later move, not the fastest safe first build. |
| Custom backend and self-managed Postgres | Rejected for this build | It adds operations and deployment work without improving the core proof: mandate enforcement, revocation, audit evidence, and controlled MPP access. |

## Decision

Use **Supabase Postgres** as the primary durable store, **Supabase Auth** for buyer and operator identities, and **Supabase Storage** for protected evidence attachments. Keep the existing Node.js service as the sole transaction authority.

Use the data platform as follows:

- Node owns privileged mandate, purchase-attempt, payment-status, refund-case, and audit-event mutations.
- The browser uses only the public Supabase client and RLS-protected read models. It does not call an RPC or table operation that can reserve spend, alter a mandate, or mark settlement.
- The Node service uses a server-only credential. Supabase documents that secret or service-role credentials bypass RLS, so they must remain in server deployment secrets and never be shipped to a browser or worker.[^supabase-rls]
- Put the mandate check, reservation, idempotency decision, and pending audit append in a single PostgreSQL transaction. A narrowly scoped database function is preferred when it makes that transaction easier to review and test. PostgreSQL functions roll back their transaction when they raise an exception.[^supabase-functions]
- Call Stripe only after the reservation commits. Finalize the attempt and append receipt evidence with idempotency protection when the provider result arrives.
- Python returns signed, schema-validated advisory results to Node. Node validates and persists accepted results under current policy.

## Why not Firebase for this project

Firebase is not unsuitable. Firestore transactions provide atomic reads and writes, retry when a concurrently read document changes, and prohibit partial commit.[^firebase-transactions] It would work for a smaller document-oriented mandate flow.

It is not the better default here because the core product needs a durable relationship between a mandate revision, purchase attempt, reservation, receipt, risk assessment, refund case, and append-only audit history. PostgreSQL makes those joins, constraints, and transaction boundaries direct. Firestore would shift more denormalization, query design, and integrity discipline into application code.

Firestore has an additional implementation hazard for this use case: its transaction callback can rerun. The callback must not call Stripe, send an email, or perform any other external side effect. Those actions need a separately committed, idempotent work step.[^firebase-transactions] The Supabase design also keeps Stripe outside the reservation transaction, but it begins with a relational transaction model already suited to the required records.

## Consequences

### Positive

- One hosted platform supplies Postgres, Auth, and protected Storage for the first build.
- PostgreSQL suits current-state checks and the cross-entity audit trail.
- RLS can protect browser-visible projections from cross-user access.
- The Node-only authority boundary remains clear and testable.
- Postgres reduces migration friction if the team later needs another managed PostgreSQL provider.

### Costs and risks

- A Supabase secret or service-role key bypasses RLS. Treat it as a production secret with server-only access, rotation, and no logging.[^supabase-rls]
- RLS does not replace Node policy. The service must still check mandate state, scope, revocation, limits, idempotency, and agent identity before payment.
- A database function that combines policy checks and reservation needs integration tests for concurrent revocation, duplicate idempotency keys, over-limit attempts, and failed settlements.
- Protected Storage needs explicit bucket and object policies. Evidence must not become public by default.
- Hosted-platform convenience is a dependency. Exportable Postgres schema migrations and an adapter boundary around Auth and Storage reduce future switching cost.

## Implementation sequence

1. Create the Supabase project and separate development environment. Store server credentials only in the Node runtime secret store.
2. Add migrations for `mandates`, `purchase_attempts`, `risk_assessments`, `audit_events`, `refund_cases`, and `worker_jobs`, following the ownership model in the Track 01 direction.[^track01]
3. Implement the one atomic Node-invoked reservation path before connecting any payment adapter.
4. Enable RLS for browser-readable tables and add role-specific policies for buyer, merchant, and auditor projections. Do not grant browser writes to authority-bearing records.
5. Add protected evidence storage and records that reference objects, rather than exposing provider receipts or passkey data directly.
6. Add concurrency, idempotency, rollback, and authorization-boundary tests.
7. Keep the current Stripe MPP endpoint as a controlled paid API resource. Do not connect it to an external marketplace purchase flow.[^runbook]

## Revisit triggers

Reconsider this decision if any of these become true:

- Offline-first mobile synchronization becomes the core product requirement.
- The build needs Firestore-native Google Cloud services that outweigh the relational audit model.
- Required query volume or operational controls exceed the chosen Supabase plan.
- A separate database security review requires a database role and connection model that the selected Supabase configuration cannot provide.

## Sources and evidence boundary

The architectural constraints come from the project’s Track 01 direction and Stripe MPP runbook. Product capabilities below are based on the linked official documentation checked on 29 August 2026. The decision is a project choice, not a claim of provider approval or completed implementation.

[^track01]: [Track 01 product direction](../../docs/track-01-product-direction.md)
[^runbook]: [Stripe MPP production runbook](../../docs/stripe-mpp-production-runbook.md)
[^supabase-rls]: [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
[^supabase-functions]: [Supabase: Database functions](https://supabase.com/docs/guides/database/functions)
[^firebase-transactions]: [Firebase: Cloud Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
