# Supabase Product Payment Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Supabase-backed product catalog whose active product endpoints are paid by either Stripe MPP or Stellar x402, with Node as the sole payment and durable-state authority.

**Architecture:** A versioned Supabase migration owns normalized product, payment-offering, endpoint, payment-attempt, access-grant, and audit relations. The Node service accesses it only through injected repositories and services. Stripe MPP is an active adapter once the existing sandbox credentials are present. Stellar x402 is configured through the same offerings table, but remains disabled until the operator supplies an OZ Channels key and Stellar recipient; it cannot silently become a non-paying route.

**Tech Stack:** Node.js 22 ESM, native Fetch API, `@supabase/supabase-js`, Supabase Postgres/Auth/RLS, Stripe MPP `mppx`, Stellar x402 configuration.

**Spec:** `api/docs/adr-0001-supabase-primary-data-platform.md`, `api/docs/track-01-product-direction.md`, `api/docs/stripe-mpp-production-runbook.md`.

## Global Constraints

- `SUPABASE_SERVICE_ROLE_KEY` is Node-only, never browser-visible, logged, committed, or passed to workers.
- The browser receives only `SUPABASE_PUBLISHABLE_KEY`, if a browser is added later. It must never write products, payment attempts, access grants, or audit events.
- A Supabase service key bypasses RLS. Node remains the only process that can invoke authority-bearing writes.
- Stripe MPP and Stellar x402 are distinct rails. No Stripe credential is reused for x402, and no x402 route is enabled without Stellar/OZ credentials.
- Payment provider calls occur after durable local intent recording. Provider receipts and payment headers are never stored verbatim if they contain credentials.
- All money amounts are integers in an explicitly documented scale. Stripe MPP USD values use cents; Stellar x402 USDC values use seven-decimal base units.
- The existing controlled `/paid` endpoint remains supported.

---

### Task 1: Add Supabase schema and security policies

**Files:**
- Create: `api/supabase/migrations/20260829193000_product_payment_infrastructure.sql`
- Create: `api/supabase/seed.sql`

**Interfaces:**
- Produces tables `products`, `product_payment_offerings`, `product_endpoints`, `payment_attempts`, `access_grants`, and `audit_events`.
- Produces a `record_payment_attempt` SQL function that inserts immutable payment-attempt and audit rows in one transaction.

- [ ] Add normalized product, offering, endpoint, payment, grant, and audit tables with UUID primary keys, foreign keys, constraints, and query indexes.
- [ ] Enable RLS on every table. Allow only public read access to published products and enabled endpoints; leave all authority-bearing tables without browser-write policies.
- [ ] Add a security-definer function that accepts a typed payment-attempt payload, enforces an idempotency key, inserts the attempt, and appends an audit row.
- [ ] Seed an inactive Stripe MPP and Stellar x402 product configuration without credentials.

### Task 2: Add server-only Supabase configuration and repository layer

**Files:**
- Modify: `api/package.json`
- Modify: `api/.env.example`
- Modify: `api/src/config.js`
- Create: `api/src/supabase.js`
- Create: `api/src/repositories/product-repository.js`
- Create: `api/src/repositories/payment-attempt-repository.js`
- Test: `api/test/config.test.js`
- Test: `api/test/product-repository.test.js`

**Interfaces:**
- `createSupabaseClient(config)` returns a server-only Supabase client with persistence and refresh disabled.
- `ProductRepository.findEnabledEndpoint(method, path)` returns a product endpoint with its offering and product, or `null`.
- `PaymentAttemptRepository.record(input)` invokes `record_payment_attempt` with no secrets or raw payment credentials.

- [ ] Add the Supabase JS dependency.
- [ ] Parse an optional, all-or-nothing `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` pair.
- [ ] Write failing unit tests for partial credentials, secret-key selection, repository endpoint lookup, and payment-attempt RPC mapping.
- [ ] Implement the small server-only client factory and repository methods with injected clients for deterministic tests.

### Task 3: Add product endpoint service and MPP payment recording

**Files:**
- Create: `api/src/services/product-catalog-service.js`
- Create: `api/src/services/payment-service.js`
- Modify: `api/src/mpp.js`
- Modify: `api/src/app.js`
- Test: `api/test/product-catalog-service.test.js`
- Test: `api/test/app.test.js`

**Interfaces:**
- `ProductCatalogService.resolve(method, path)` returns an enabled endpoint configuration.
- `PaymentService.serveMppEndpoint(endpoint, request)` creates a Stripe MPP charge using the configured offering, sends a 402 challenge, and records a settled attempt only after the handler creates a receipt-backed success response.
- `createApp({ paidHandler, productCatalogService, paymentService })` retains static routes and delegates matching catalog routes.

- [ ] Test an active MPP product endpoint's 402 and success routing with fake services.
- [ ] Test inactive, unknown, and x402-not-enabled endpoint behavior as structured non-success responses.
- [ ] Implement amount conversion from offering cents to MPP decimal amount and audit-safe payment-attempt recording.
- [ ] Add catalog endpoint discovery to `/openapi.json` without exposing payment configuration secrets.

### Task 4: Add x402 configuration boundary and operator interfaces

**Files:**
- Create: `api/src/x402-config.js`
- Modify: `api/.env.example`
- Modify: `api/README.md`
- Create: `api/docs/supabase-setup.md`
- Test: `api/test/x402-config.test.js`

**Interfaces:**
- `loadX402Config(environment)` accepts only a complete Stellar testnet or pubnet configuration and fails closed for partial settings.
- A product offering with rail `stellar_x402` is only considered enabled when `loadX402Config` succeeds and its network agrees with the offering.

- [ ] Test complete and partial x402 configuration, including the exact `stellar:testnet` and `stellar:pubnet` values.
- [ ] Document Supabase credentials, project setup, migration commands, environment boundaries, RLS posture, and the separate Stripe MPP and Stellar x402 credential sets.
- [ ] Document how to enable a supplied x402 endpoint only after an OZ Channels key, recipient account, USDC trustline, and matching network are present.

### Task 5: Verify local artifacts and remote migration procedure

**Files:**
- Modify: `api/README.md`
- Modify: `docs/superpowers/plans/2026-08-29-supabase-product-payment-infrastructure.md`

- [ ] Run API unit tests.
- [ ] Build the Docker image from `api/` and verify no environment file is included.
- [ ] Validate SQL migration shape with a local Supabase CLI if available; otherwise provide exact `supabase link`, `supabase db push`, and `supabase gen types --linked` commands without claiming remote execution.
- [ ] Commit and push only verified repository artifacts.

## Credentials required for remote provisioning

| Purpose | Variable or credential | Where it belongs |
| --- | --- | --- |
| Node runtime database access | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Railway API service only |
| Browser reads, future UI only | `SUPABASE_PUBLISHABLE_KEY` | Browser build environment, never used for authority writes |
| Supabase CLI project management | `SUPABASE_ACCESS_TOKEN`, project ref, database password | Operator terminal or CI secret store, never API runtime |
| Stripe MPP endpoint | existing test Stripe key, test profile ID, MPP challenge secret | Node runtime only |
| Stellar x402 seller | `OZ_API_KEY`, `STELLAR_RECIPIENT`, `STELLAR_NETWORK`, facilitator URL | Node runtime only |

## Self-review

- Schema covers products, offerings, product endpoints, payment attempts, access grants, and immutable audit events.
- RLS separates public catalog reads from Node-only authority writes.
- The product service does not allow a disabled or incomplete x402 rail to serve content.
- Stripe MPP and Stellar x402 state remain separate.
- No secret values appear in migration, seed, tests, documentation examples, logs, or commit history.
