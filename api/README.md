# Stripe MPP sandbox API

A Node.js MPP endpoint that charges an agent for the controlled `GET /paid` resource. It is not an external-marketplace checkout service.

## Security boundary

- The endpoint is sandbox-only by default.
- `STRIPE_SECRET_KEY` and `MPP_SECRET_KEY` stay in `api/.env`, which Git ignores.
- Never send a Stripe secret key through chat, browser code, Python workers, logs, or Git.
- A live secret key sent through chat must be rotated before use.
- `STRIPE_MODE=live` is blocked unless `ALLOW_LIVE_MPP_TEST=true` is set explicitly. Do not set it for this project until the live-money gates in [`docs/stripe-mpp-production-runbook.md`](./docs/stripe-mpp-production-runbook.md) are complete.

## Data-platform decision

[ADR-0001](./docs/adr-0001-supabase-primary-data-platform.md) selects Supabase Postgres, Auth, and Storage for the Track 01 build. Node remains the only mandate and payment authority; browser and Python code remain advisory or projection-only.

## Sandbox setup

1. Create a Stripe sandbox and create a sandbox business profile in the Stripe Dashboard.
2. Copy `api/.env.example` to `api/.env`.
3. Fill in only sandbox values:

   ```dotenv
   STRIPE_MODE=sandbox
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PROFILE_ID=profile_test_...
   MPP_SECRET_KEY=...
   ```

4. Generate the MPP challenge secret locally. It must contain at least 32 random bytes:

   ```bash
   openssl rand -base64 32
   ```

5. Start the endpoint:

   ```bash
   npm start
   ```

6. In a separate terminal, run the MPP validator:

   ```bash
   npm run validate:mpp
   ```

The endpoint exposes `GET /health` without payment and protects `GET /paid` with Stripe MPP. `mppx validate` performs sandbox test transactions when the endpoint has valid sandbox configuration.

`dotenv` loads the local `.env` file before application configuration. It does not overwrite an existing process variable, so an injected deployment value remains authoritative. The production Docker image compiles TypeScript during its build and runs `node dist/bootstrap/index.js`; it contains neither `.env` nor the `tsx` development dependency.

## What is needed from Stripe

The service will not start until all required Stripe and MPP values are set. Supabase variables are optional until the database-backed product catalog is enabled:

| Variable | Source | Boundary |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe sandbox API keys | Node process only |

| `STRIPE_PROFILE_ID` | Sandbox Stripe business profile | Node process only |
| `MPP_SECRET_KEY` | Locally generated random value | Node process only |

Do not substitute a `pk_test_...` or `pk_live_...` publishable key for `STRIPE_SECRET_KEY`. The server needs its sandbox secret key. Do not use a live key to prove this sandbox flow.

## Railway deployment

The API directory contains `Dockerfile`. Railway infrastructure is defined in [`.railway/railway.ts`](./.railway/railway.ts), which replaces the deprecated `railway.json`. Railway builds the Dockerfile, injects the runtime environment, probes `GET /health`, and activates the deployment only after it receives HTTP `200`.

The image intentionally contains no `.env`. On Railway, `dotenv` finds no local file and the service uses Railway's injected Variables instead; do not add a secret file to the image to work around a variable problem.

1. Install the Railway CLI and link the project:

   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   ```

2. Apply the infrastructure configuration:

   ```bash
   railway config plan
   railway config apply
   ```

   This creates or updates the `api` service with root directory `api`, Dockerfile build, and `/health` readiness check.
3. In the service's Variables page, configure sandbox values only:

   ```dotenv
   STRIPE_MODE=sandbox
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PROFILE_ID=profile_test_...
   MPP_SECRET_KEY=<at least 32 random bytes>
   ```

   Railway supplies `PORT`; do not add a fixed `PORT` variable. Never commit or paste any variable value into chat or `.railway/railway.ts`.

4. Generate a public domain from the Railway service settings, then verify `https://<domain>/health` returns `{"status":"ok"}`.
5. Verify `https://<domain>/paid` returns an MPP `402` challenge. A test-style configuration proves deployment and challenge routing only. It does not prove Stripe settlement.

Do not configure `STRIPE_MODE=live` or `ALLOW_LIVE_MPP_TEST=true` on Railway until the live-money gates in the [production runbook](./docs/stripe-mpp-production-runbook.md) are complete. Railway's health check behavior and `PORT` contract are described in the [Railway health-check documentation](https://docs.railway.com/guides/healthchecks). Infrastructure as Code is documented in the [Railway IaC guide](https://docs.railway.com/infrastructure-as-code).

## Verification completed locally

`npm test` verifies sandbox credential gating, explicit live-mode acknowledgement, the MPP `402` challenge, controlled-resource routing, and the Fetch-to-Node HTTP adapter. A real `mppx validate` run remains pending until valid sandbox credentials and a sandbox `profile_test_...` ID are present in the local ignored `.env` file.

## References

- [Stripe MPP](https://docs.stripe.com/payments/machine/mpp)
- [Stripe MPP production runbook](./docs/stripe-mpp-production-runbook.md)
