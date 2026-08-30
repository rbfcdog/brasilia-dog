# Vero technical decision log

_Code-freeze record for the NextWave Hackathon 2026 — Challenge 01, “The Buyer Who Isn’t Human.”_

## Decision-making principle

Vero was built in 24 hours to answer one narrow question well: **how can a merchant accept an AI-originated purchase without letting the AI define its own authority?**

We did not optimize for feature count or claim that a hackathon deployment is ready for millions of users. We optimized for a trust model that can be demonstrated, tested, and explained under adversarial questioning. The resulting rule is simple: the model may discover and propose; deterministic services decide whether money is authorized to move.

Every entry below states what we chose, what we rejected, the cost we accepted, the repository evidence, and the condition that would justify a more scalable design. “Revisit” is not shorthand for “we forgot”; it records the point at which the current trade-off stops being rational.

## Code-freeze evidence boundary

The distinction between implemented behavior and intended architecture is part of the decision log, not a footnote.

| Classification | What the repository proves | What we do not claim |
| --- | --- | --- |
| **Implemented and tested** | A Node authority service; Supabase-backed identities, passkeys, sessions, catalog and conversation data; mandate and agent-proof verification; bounded marketplace search; a Stripe MPP-controlled resource; merchant projections and command boundaries; a LangGraph purchase workflow with allow, reject, escalation, resume, expiry, revocation, replay and tamper tests. | That these individually tested controls are already one production-settled marketplace transaction from the buyer screen to Stripe. |
| **Contract-defined or adapter-demonstrated** | The agent’s HTTP adapter preserves exact signed bodies and defines remote signing, purchase presentation, and approval-resume contracts. The same graph runs against a deterministic demo authority, and the HTTP boundary has contract tests. | That the Node API currently implements every purchase-orchestration route described in the agent contract, or that a production KMS has been provisioned. |
| **Deliberately simulated or deferred** | The buyer-facing `/api/purchases` route uses a deterministic mock; the agent’s demo mode uses an ephemeral signing key and in-memory checkpoints; the live OpenAI smoke test is opt-in; Stripe live mode is gated; Stellar x402 is disabled. | Live settlement, durable multi-replica agent execution, automatic refunds, an immutable ledger, raw biometric handling, or production-scale readiness. |

### Verification baseline

At code-freeze inspection, the hermetic suites produced the following evidence:

- API: **114 of 114 tests passed**; typecheck passed.
- Agent: **39 tests passed** and the opt-in live OpenAI smoke test was skipped; typecheck passed.
- Frontend: **52 of 52 tests passed**; lint and typecheck passed.

These counts support the behaviors covered by the tests. They are not a substitute for provider certification, load testing, penetration testing, or a live-money reconciliation exercise.

## Decisions

### 1. Governed agentic commerce over a general shopping agent

**Decision:** Build Vero as an authorization control plane for a constrained purchase, not as a general autonomous assistant with arbitrary browsing, tools, merchants, and payment methods.

**Context:** In a 24-hour build, breadth would have made the most important claim harder to prove. The challenge is not whether an LLM can recommend a product; it is whether a non-human buyer can present limited, revocable authority that a merchant can verify at decision time.

**Alternatives considered:**

- A broad shopping copilot with web browsing and checkout automation. It would create a more varied demo but a much larger prompt-injection and integration surface.
- A payment-token demo without agent identity or mandate state. It would be smaller, but it would not answer revocation, impersonation, or dispute questions.
- A narrow governed flow with explicit identity, mandate, proof, policy decision, and audit evidence.

**Why this choice fit the prototype:** The narrow flow makes the differentiator observable: authority does not travel with the model. It also lets the same mechanism be tested against over-limit selection, expiry, revocation, replay, tampering, and human escalation rather than showing only a happy path.

**Accepted consequences:** Product scope and payment rails are intentionally constrained. The prototype does not claim general web purchasing or dynamic tool invention.

**Repository evidence:** The challenge scope is recorded in [Challenge 01](./challenge-01-buyer-who-isnt-human.md). The agent exposes a small state graph in [`agent/src/graph.ts`](../agent/src/graph.ts), and the buyer experience describes a limited mandate rather than open-ended payment authority.

**Production-scale revisit trigger:** Add broader merchant discovery or tool composition only after each new capability has an explicit permission model, untrusted-input boundary, failure policy, and regression suite. Generality should follow reusable governed workflows, not precede them.

### 2. One authoritative Node service; browser and agent remain non-authoritative

**Decision:** Keep the Node API as the sole service allowed to authenticate authority-bearing requests, resolve current mandate and product state, record payment evidence, and invoke privileged database or payment operations. Treat the browser, model output, conversation history, and catalog content as untrusted inputs.

**Context:** The process most exposed to prompts and third-party content must not also be the process that decides whether money may move. Likewise, a polished client must not become a second policy engine.

**Alternatives considered:**

- Let the agent call Stripe or Supabase directly. This removes hops but turns agent compromise into financial or database compromise.
- Let the browser validate mandates and submit privileged writes. This is fast to prototype but makes client-side state an authorization boundary.
- Centralize authority in Node and expose only bounded service contracts to the browser and agent.

**Why this choice fit the prototype:** A single authority boundary is easier to reason about, test, and explain. The agent returns proposals or signed evidence; the backend independently validates identity, current mandate state, scope, price, and request integrity. Frontend screens render outcomes and projections rather than granting permission.

**Accepted consequences:** Node is an availability dependency and a potential throughput bottleneck. More calls cross service boundaries, and integration contracts must be kept aligned.

**Repository evidence:** The boundary is wired in [`api/src/bootstrap/index.ts`](../api/src/bootstrap/index.ts), enforced by the purchase and cross-credential services, and summarized in the [API-gateway architecture](../agent/docs/api-gateway-chat-architecture.md). The frontend [README](../front/README.md) records that it contains no direct Supabase client or infrastructure credential.

**Production-scale revisit trigger:** Scale the authority as a stateless service tier backed by transactional storage, idempotent commands, a transactional outbox, rate limits, workload identity, and regional failure controls. Split services only along explicit ownership boundaries; do not distribute the authorization decision across eventually consistent components.

### 3. AI for discovery and proposal; deterministic code for authorization

**Decision:** Use the OpenAI Responses API for bounded catalog research, product comparison, mandate proposals, and one offer-selection step. Use strict schemas and deterministic backend rules for every authorization outcome.

**Context:** An LLM is useful where inputs are ambiguous and ranking is semantic. It is the wrong authority for exact limits, expiry, revocation, identity binding, idempotency, or replay protection.

**Alternatives considered:**

- Ask the model whether a purchase is authorized. This is flexible but non-deterministic and vulnerable to persuasive untrusted content.
- Remove AI and use fixed filters only. This is predictable but does not demonstrate useful agentic discovery or natural-language mandate preparation.
- Constrain AI to advisory steps and validate all outputs before any purchase presentation.

**Why this choice fit the prototype:** Catalog tools are allowlisted and bounded to three rounds. Structured Outputs are parsed again with Zod; returned product IDs must originate in backend results; an invalid selection receives one retry and then fails before purchase. The backend’s response discriminant—`allowed`, `rejected`, or `escalation_required`—is the only accepted authority result.

**Accepted consequences:** The agent is less open-ended and may stop instead of improvising when dependencies or schemas fail. That loss of flexibility is intentional for a money-moving workflow.

**Repository evidence:** See [`agent/src/chat.ts`](../agent/src/chat.ts), [`agent/src/selector.ts`](../agent/src/selector.ts), and the catalog-tool, prompt-injection, invalid-output, and policy-path tests under [`agent/test`](../agent/test/).

**Production-scale revisit trigger:** Expand model autonomy only with per-tool capabilities, policy-aware tool metadata, model and prompt versioning, offline evaluations, adversarial test corpora, latency and cost budgets, and a kill switch. Deterministic authorization remains outside the model.

### 4. Explicit LangGraph state machine instead of a general agent framework

**Decision:** Implement the purchase workflow as a small named LangGraph state machine and call the Responses API directly, instead of using `deepagents` or hiding the flow in sequential orchestration code.

**Context:** The flow needs a visible pause and resume boundary for human approval, but it does not need delegation, filesystem access, arbitrary planning, or a large tool ecosystem.

**Alternatives considered:**

- `deepagents`, which offers planning, delegation, files, and broad tool use but introduces capabilities and failure paths the flow does not require.
- Plain sequential Node code, which is smaller but makes checkpointed interruption and transition inspection less explicit.
- A finite LangGraph with named nodes, typed state, conditional outcomes, and one human interrupt.

**Why this choice fit the prototype:** The graph mirrors the business process: load mandate, search, select, build claim, sign, present, then complete, reject, or wait for a human. Each step is individually observable and the approval resume creates a new signed request rather than silently continuing from UI state.

**Accepted consequences:** The workflow is purpose-built and carries a framework dependency. New purchase types require deliberate graph or adapter evolution rather than being invented at runtime.

**Repository evidence:** [`agent/src/graph.ts`](../agent/src/graph.ts) contains the complete transition graph and interrupt. [`agent/test/graph.test.ts`](../agent/test/graph.test.ts) covers allowed, rejected, escalated, resumed, revoked, changed-version, expired, invalid-model, and dependency-failure paths.

**Production-scale revisit trigger:** Introduce shared graph abstractions only after multiple workflows demonstrate genuinely common states and policies. Before multi-replica deployment, replace the in-memory checkpointer with durable, encrypted, tenant-scoped persistence.

### 5. Separate human presence, agent intent, and financial authority

**Decision:** Represent three independent facts: a passkey-backed session proves recent human presence; an Ed25519 proof identifies the agent and binds its intent; a current mandate defines financial authority. A purchase requires all relevant facts to agree.

**Context:** Combining these facts into one reusable bearer credential would make compromise of the agent or client equivalent to compromise of the buyer’s authority.

**Alternatives considered:**

- Give the agent a reusable payment token containing limits. Simpler, but the authority still travels with the most exposed process.
- Require only a passkey. This proves a human interaction but not which agent presented the request or which bytes it intended.
- Require only an agent signature. This proves an agent claim but not current human ownership, mandate state, or revocation.
- Verify all three layers independently.

**Why this choice fit the prototype:** The cross-credential service verifies the passkey session, active agent and signing key, proof, mandate status and version, expiry, agent ownership, user ownership, and scope. Compromise of one credential does not automatically satisfy the other checks.

**Accepted consequences:** The protocol and enrollment experience are more complex. Passkey sessions, agent keys, and mandates require separate lifecycle, revocation, and audit rules.

**Repository evidence:** [`api/src/services/passkey-service.ts`](../api/src/services/passkey-service.ts), [`api/src/services/cross-credential-auth.ts`](../api/src/services/cross-credential-auth.ts), the durable passkey migrations, and [`api/test/cross-credential.test.ts`](../api/test/cross-credential.test.ts) implement and exercise the separation. WebAuthn verification requires user verification; biometric material itself is never requested or stored by Nomad.

**Production-scale revisit trigger:** Add device and credential management, step-up policies based on transaction risk, recovery and re-enrollment, hardware-backed workload identity, key rotation, and independent security review. Do not collapse the three facts into one credential for performance.

### 6. Action-bound, short-lived proofs; signatures are evidence, not permission

**Decision:** Bind each `agent-proof-v1` signature to the SHA-256 of the exact serialized request body, HTTP method, path, agent and key IDs, mandate ID and version, nonce, issue time, and expiry. Revalidate current state after signature verification.

**Context:** A valid signature can still be replayed, moved to another endpoint, paired with altered bytes, or presented after a mandate has changed unless its meaning is narrow and the backend checks current authority.

**Alternatives considered:**

- A long-lived bearer or JWT asserting that an agent is generally authorized. Easy to transmit, but too broad and replayable.
- Sign only a product ID or semantic claim. Smaller, but it leaves route, amount, and serialization ambiguity.
- Sign a canonical action envelope with freshness and one-use nonce, then independently enforce policy.

**Why this choice fit the prototype:** The proof makes the agent’s specific claim tamper-evident without granting standalone spending power. Exact-body hashing prevents reserialization drift; method and path prevent cross-endpoint reuse; nonce and expiry limit replay; mandate version detects stale authority. A revoked mandate still defeats a cryptographically valid proof.

**Accepted consequences:** Serialization becomes part of the protocol, clock skew must be bounded, nonces need durable uniqueness, and every presentation needs verification plus a current-state lookup.

**Repository evidence:** The canonical payload and lifetime rules are in [`api/src/services/agent-proof.ts`](../api/src/services/agent-proof.ts). Exact-body construction is in [`agent/src/graph.ts`](../agent/src/graph.ts). Tampering, wrong identity, replay, expiry, and body mutation are covered by [`agent/test/proof.test.ts`](../agent/test/proof.test.ts) and API proof tests.

**Production-scale revisit trigger:** Move nonce consumption and attempt reservation into one database transaction, define clock synchronization and rotation policy, version the proof format, and add concurrency tests. Consider standards-based workload credentials only if they retain equivalent request binding and revocation semantics.

### 7. Remote signing as the target boundary; ephemeral signing only for the demo

**Decision:** Define the production boundary so the agent requests a short-lived signature from a backend-controlled signer and never receives an exportable private key. Use an ephemeral in-process Ed25519 key only inside deterministic demo mode.

**Context:** A remote signer preserves custody, rotation, identity mapping, and audit at the authority boundary. Implementing and provisioning a production KMS plus every purchase orchestration route was not a rational 24-hour critical path.

**Alternatives considered:**

- Store an exportable private key in the agent service. This removes a network call but converts agent compromise into durable key compromise.
- Use only the agent-to-backend bearer token. This authenticates a channel but does not produce action-specific evidence.
- Define and contract-test a remote signer while using an isolated ephemeral key for the executable demo.

**Why this choice fit the prototype:** The adapter seam lets the graph exercise the final trust shape without pretending that production custody exists. HTTP mode calls the remote signer contract; demo mode generates a key that disappears on restart and is never presented as production KMS protection.

**Accepted consequences:** The full Node remote-signing and purchase-presentation route set is not implemented end to end. Production signing adds latency and an availability dependency; demo signatures have no durability or production identity value.

**Repository evidence:** [`agent/src/adapters.ts`](../agent/src/adapters.ts) implements the HTTP signer client, [`agent/src/demo.ts`](../agent/src/demo.ts) contains the ephemeral authority, and the [backend contract](../agent/docs/backend-contract.md) explicitly marks purchase routes as proposed while identifying the currently implemented context routes.

**Production-scale revisit trigger:** Provision a managed or hardware-backed non-exportable key, authenticate workloads with short-lived identity, enforce per-agent signing policy, log signing decisions, rotate keys, and implement the authoritative purchase routes before treating HTTP mode as production-capable.

### 8. Supabase Postgres and server-only RPCs over document storage or self-hosting

**Decision:** Use Supabase Postgres for durable relational state and Auth, protect browser-visible data with RLS and security-invoker projections, and reserve authority-bearing mutations for Node through narrowly scoped server-only operations.

**Context:** The domain connects users, passkeys, agents, keys, mandate versions, products, offerings, payment attempts, proofs, conversations, refunds, and audit events. Those relationships and conditional state transitions matter more than offline-first synchronization.

**Alternatives considered:**

- Firebase/Firestore, which offers managed identity and transactions but would push more relationship integrity, denormalization, and retry-safe side-effect discipline into application code.
- Managed Postgres plus separate Auth and storage providers, which improves provider independence but adds integration work.
- Self-managed Postgres and identity infrastructure, which spends hackathon time on operations rather than the trust mechanism.

**Why this choice fit the prototype:** Postgres provides constraints, joins, indexes, transactions, full-text search, and a portable migration history. Supabase removes setup work while RLS and projections constrain browser reads. Service-role access is deliberately server-only; because it can bypass RLS, Node policy remains mandatory.

**Accepted consequences:** The system depends on a hosted platform and a high-impact server credential. RLS configuration, privileged functions, and migrations become security-critical code. The current suites do not replace concurrent database integration testing.

**Repository evidence:** The rationale is detailed in [ADR-0001](../api/docs/adr-0001-supabase-primary-data-platform.md). Versioned migrations under [`api/supabase/migrations`](../api/supabase/migrations/) enable RLS, restrict privileged functions, add relational constraints and indexes, and create bounded marketplace search and merchant projections.

**Production-scale revisit trigger:** Add separate environments and database roles, secret rotation, pooled connections, backups and restore drills, migration gates, concurrency and RLS integration tests, query monitoring, and regional recovery. Move to another managed Postgres provider if operational or compliance requirements outgrow Supabase; preserve the relational model and authority boundary.

### 9. Backend-owned chat persistence and commit ordering

**Decision:** Route authenticated chat through the Node API, persist the user message before invoking the agent, and persist the assistant response and structured events before returning success to the browser.

**Context:** Earlier browser-coordinated persistence allowed the agent call and database writes to succeed or fail independently, producing visually successful turns with empty or partial transcripts.

**Alternatives considered:**

- Let the browser call the agent and then append messages. This is simple but cannot guarantee ordering or completion.
- Let the agent write directly to Supabase. This shares database authority and credentials with an advisory service.
- Make Node the orchestration and commit boundary for authenticated turns.

**Why this choice fit the prototype:** The user message becomes durable before external model work begins. A successful response means the assistant message and agent-response evidence have been committed. The agent reads only a bounded transcript through a service-authenticated route and treats that transcript as untrusted context.

**Accepted consequences:** Chat availability now depends on the API, database, and agent service. If the agent fails after the user message commits, the transcript can contain a user turn without an assistant turn; that is an honest recoverable state rather than a fabricated success.

**Repository evidence:** [`api/src/services/backend-chat-service.ts`](../api/src/services/backend-chat-service.ts) defines the ordering. [`api/test/backend-chat.test.ts`](../api/test/backend-chat.test.ts) verifies commit order and safe failures. The architecture and bounded context rules are documented in [API-gateway chat architecture](../agent/docs/api-gateway-chat-architecture.md).

**Production-scale revisit trigger:** Introduce a durable job/outbox record, explicit `pending` and `failed` turn states, idempotent retries, model-call timeouts, trace correlation, retention policy, deletion workflows, and backpressure. Preserve server ownership of commit state.

### 10. Same-origin BFF and allowlisted proxy instead of browser-held infrastructure access

**Decision:** Put a Next.js backend-for-frontend between the browser and Node API. Store account and passkey session credentials in scoped HttpOnly cookies where applicable, construct authorization headers server-side, and proxy only explicitly allowlisted paths and response headers.

**Context:** The frontend needs buyer and merchant sessions, passkey enrollment, chat, and MPP challenge handling without receiving service tokens, Supabase server credentials, or unrestricted backend proxy capability.

**Alternatives considered:**

- Call the Node API and Supabase directly from the browser. Fewer server hops, but more CORS, token exposure, and duplicated session logic.
- Create an unrestricted catch-all proxy. Easy to extend, but it silently exposes every future backend route.
- Use a same-origin, path-allowlisted BFF with narrow header forwarding.

**Why this choice fit the prototype:** The BFF centralizes cookie policy, refresh behavior, passkey enrollment claims, JSON response validation, and controlled forwarding. The browser only sees same-origin application endpoints; Node still performs authoritative verification.

**Accepted consequences:** The BFF adds a deployment component and some duplicated route knowledge. Cookie scope and token refresh are security-sensitive, and the allowlist must be updated intentionally when APIs change.

**Repository evidence:** [`front/src/app/api/backend/[...path]/route.ts`](../front/src/app/api/backend/%5B...path%5D/route.ts) contains the allowlist and header policy. Authentication routes use HttpOnly cookies, while tests in [`front/src/app/api/backend/backend-session.test.ts`](../front/src/app/api/backend/backend-session.test.ts) exercise session forwarding and refresh behavior.

**Production-scale revisit trigger:** Add CSRF controls for all state-changing cookie-authenticated routes, centralized route metadata, rate limits, security headers, audit correlation, edge and origin observability, and independent threat modeling. If clients other than the web app are introduced, give them explicit OAuth-style clients rather than reusing browser cookies.

### 11. Stripe MPP sandbox as one controlled rail; live money and x402 fail closed

**Decision:** Demonstrate Stripe MPP on a controlled fixed-price API resource in sandbox mode. Require explicit acknowledgement and live credentials before live mode can start, and keep Stellar x402 disabled instead of presenting multiple incomplete rails as interchangeable settlement.

**Context:** Provider activation, business verification, live-money safety, refunds, disputes, and reconciliation are external dependencies that cannot responsibly be compressed into a 24-hour demo claim.

**Alternatives considered:**

- Mock every payment protocol. Safest operationally, but it would not demonstrate a real MPP challenge boundary.
- Enable live Stripe immediately. More spectacular, but exposes real funds before readiness gates and provider operations exist.
- Advertise both Stripe MPP and x402 from shared catalog configuration. Broader, but likely to hide incomplete credentials or create a non-paying fallback.
- Prove one sandbox rail and fail closed everywhere else.

**Why this choice fit the prototype:** The service verifies sandbox credential shape, requires a dedicated challenge secret, returns a real MPP `402` challenge for a controlled resource, records only safe receipt metadata, and refuses profile mismatch. Live mode requires the explicit `ALLOW_LIVE_MPP_TEST=true` gate. The x402 migration disables that rail rather than silently routing around payment.

**Accepted consequences:** The demo does not prove external marketplace settlement or production payment operations. A real `mppx validate` round trip still depends on valid sandbox credentials, and the live validator is intentionally outside the default test suite.

**Repository evidence:** [`api/src/payments/mpp.ts`](../api/src/payments/mpp.ts), [`api/src/services/payment-service.ts`](../api/src/services/payment-service.ts), the MPP and configuration tests, the `disable_stellar_x402` migration, and the [production runbook](../api/docs/stripe-mpp-production-runbook.md) define the boundary.

**Production-scale revisit trigger:** Complete provider onboarding, restricted-key review, webhook verification, idempotent settlement and refund operations, reconciliation, alerts, dispute ownership, fraud controls, sandbox end-to-end validation, and a separately approved low-value live test. Add a second rail only with its own credentials, accounting model, failure semantics, and reconciliation tests.

### 12. Merchant projections and refund cases instead of privileged client writes

**Decision:** Give merchants owner-scoped, security-invoker projections for dashboards, orders, catalog, finance, risk reasons, and audit events. Route product commands through Node and model refund initiation as a pending operations case, not an automatic Stripe refund.

**Context:** A merchant console must be useful without becoming another path to change payment or audit state. Refunds are financially consequential and require policy, provider state, ownership validation, and operational review.

**Alternatives considered:**

- Let authenticated merchants write product, payment, or refund tables directly. Fast, but difficult to constrain and audit consistently.
- Compute all metrics and risk labels in the browser. Flexible presentation, but inconsistent and easy to manipulate.
- Call Stripe immediately when a merchant clicks “refund.” Impressive, but unsafe without reconciliation and approval policy.
- Serve owner-scoped projections and record a bounded pending refund case.

**Why this choice fit the prototype:** Projections keep risk reasons deterministic and inspectable. Node derives merchant ownership from the authenticated user and calls atomic database functions for create, publish, and refund-case commands. A refund request validates ownership, settled status, amount, reason, and duplicate-open-case constraints without moving funds.

**Accepted consequences:** The merchant experience cannot complete a real refund. SQL projections couple some product semantics to Postgres, and their performance must be monitored as data grows.

**Repository evidence:** [Merchant platform](./merchant-platform.md), the `merchant_platform` migration, [`api/src/services/merchant-service.ts`](../api/src/services/merchant-service.ts), and [`api/test/merchant-service.test.ts`](../api/test/merchant-service.test.ts) describe and test the boundary.

**Production-scale revisit trigger:** Add a reviewed refund workflow with authorization levels, provider execution workers, webhook reconciliation, case state transitions, service-level objectives, alerts, and immutable provider references. Materialize or incrementally maintain expensive projections only when measured query volume requires it.

### 13. Dual-mode adapters, in-memory checkpoints, and an explicit simulated purchase path

**Decision:** Preserve one graph and service contract while supporting `demo` and `http` adapters. Use in-memory LangGraph checkpoints and run metadata for the single-replica demo. Keep the buyer-facing purchase execution deterministic and simulated until the authoritative purchase contract is fully connected.

**Context:** A live hackathon demo must survive missing provider credentials and parallel backend work. Hiding incomplete integration behind a “production-like” claim would make the technical defense weaker, not stronger.

**Alternatives considered:**

- Block the demo until every service and provider is integrated. Architecturally pure, but exposes the presentation to external activation and branch timing.
- Let frontend mocks masquerade as backend settlement. Visually smooth, but dishonest and impossible to defend.
- Build durable distributed checkpoints and orchestration immediately. Correct for scale, but not the highest-value 24-hour work.
- Isolate simulation behind named routes and adapters, contract-test the intended boundary, and state the limitation.

**Why this choice fit the prototype:** Demo mode exercises the same state transitions, proof format, allow/reject/escalate outcomes, revocation behavior, and approval resume without external money. HTTP adapters prove request shapes and exact-byte preservation. The frontend mock is a clearly identifiable module rather than hidden fallback logic.

**Accepted consequences:** Restarting the agent loses runs and pending approvals; multiple replicas cannot resume one another’s work; demo receipts have no settlement value; the buyer UI, agent run, and merchant workspace must not be described as one shared end-to-end payment until they share the same authoritative attempt.

**Repository evidence:** [`agent/src/adapter-factory.ts`](../agent/src/adapter-factory.ts), [`agent/src/run-store.ts`](../agent/src/run-store.ts), [`agent/src/graph.ts`](../agent/src/graph.ts), [`front/src/app/api/purchases/route.ts`](../front/src/app/api/purchases/route.ts), and [`front/src/mocks/shopping.ts`](../front/src/mocks/shopping.ts) make each boundary explicit.

**Production-scale revisit trigger:** Implement the remaining Node purchase contracts, connect all three user surfaces to the same durable attempt ID, move graph checkpoints and run metadata to durable encrypted storage, use idempotent queue workers, support safe multi-replica resume, add distributed tracing and multi-region observability, and run concurrency, restart, load, and provider-failure tests before production traffic.

## Closing position

The central technical choice is not a framework, model, or payment protocol. It is the placement of trust.

Nomad trusts AI to interpret intent, search, compare, and propose. It does not trust AI to manufacture authority. Human presence, agent intent, current mandate state, and payment execution remain separate facts, checked at separate boundaries. Where the 24-hour build could not complete a production boundary, the repository uses an explicit adapter or simulation and records the migration trigger instead of overstating the demo.

That is the standard behind every decision in this log: **a modest capability with a defensible authority model is more valuable than a spectacular flow whose trust assumptions cannot be explained.**
