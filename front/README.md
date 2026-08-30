# Vero unified commerce platform

Vero is a unified Buyer and Merchant frontend for governed, fixed-price agentic commerce. Buyers define purchasing mandates. Merchants publish structured products and inspect the evidence behind agent-originated orders.

## Live deployment

Open the deployed frontend at:

<https://vero-kappa-umber.vercel.app>

The public landing page currently exposes:

- Buyer workspace selection and sign in.
- Merchant workspace selection and sign in.
- Buyer account creation with CPF, email, and password.
- Merchant account creation with CPF, CNPJ, business name, email, and password.
- Native passkey setup after account creation.
- A clearly labelled demo passkey path when native enrollment is unavailable.

Unauthenticated access to `/assistant` redirects to the landing page with the requested destination preserved. The merchant entry point is `/merchant/login`.

## Routes

- `/` - unified Buyer/Merchant landing and authentication.
- `/assistant` - protected Buyer shopping agent.
- `/history` - protected Buyer conversation history.
- `/scheduled` - protected Buyer scheduled mandates.
- `/profile` - protected Buyer profile and permission settings.
- `/support` - protected Buyer support page.
- `/merchant/login` - Merchant authentication.
- `/merchant/dashboard` - protected Merchant overview.
- `/merchant/orders` - protected Merchant orders.
- `/merchant/catalog` - protected Merchant catalog.
- `/merchant/finance` - protected Merchant finance view.

## Authentication and trust boundaries

The browser communicates with same-origin Next.js BFF routes. The BFF forwards server-only credentials to the Node API. The browser never receives the Supabase service key, Stripe secret, MPP secret, agent service token, or agent private key.

Native authentication uses WebAuthn passkeys through `navigator.credentials.create()` and `navigator.credentials.get()`. The device may use biometrics, a PIN, or another local verifier. Vero never receives biometric data or passkey private material.

The first account access may show:

1. **Set up passkey**: the real WebAuthn enrollment flow.
2. **Finish on a secure device**: a user-bound enrollment QR flow.
3. **Continue without passkey (demo)**: a sandbox-only demo session. This is not native WebAuthn and is not production authentication.

After enrollment, workspace access and purchase approval require passkey verification. Browsing the catalog does not approve a purchase.

## Buyer flow

1. Sign in or create a Buyer account at the live URL.
2. Complete native passkey setup, or choose the explicitly labelled demo path only for sandbox demonstrations.
3. Open the Buyer assistant.
4. Describe a product need or use one of the suggested prompts.
5. Review the structured response, product results, category, price, and mandate constraints.
6. Approve a mandate only after checking its scope, maximum amount, currency, validity, and constraints.
7. Complete the fresh passkey approval.
8. Observe the agent search, candidate offers, selected product, and result.

The assistant persists authenticated conversations in the backend. The UI reports whether conversation storage is connected to the backend or unavailable.

## Suggested prompts

The live Buyer assistant presents these prompts:

- `Buy an ultrawide monitor up to $300`
- `Find me a monitor`
- `Track a 34-inch ultrawide monitor under $220`
- `I want the refund`

The first prompt should produce a mandate proposal. The second should request missing constraints. The third should create a monitoring-oriented mandate when the configured backend and agent services are available. The refund prompt requires an authenticated user with an owned settled Stripe sandbox payment; the agent classifies the intent and the Node API refunds the latest eligible payment server-side.

These prompts are demonstrations of the product flow, not a guarantee that the deployed environment has every backend dependency configured. A successful local UI load proves only that the frontend deployment is serving; it does not prove that OpenAI, the agent service, Supabase migrations, or Stripe sandbox settlement are available.

## Merchant flow

1. Select **Merchant** on the landing page or open `/merchant/login`.
2. Sign in or create a merchant account.
3. Open the catalog to create a draft fixed-price product.
4. Provide structured metadata, including category and exact price.
5. Publish the product.
6. Review whether the product has an active MPP endpoint and is discoverable by buyer agents.
7. Inspect orders, audit evidence, and finance projections.

Publishing a product does not itself create a buyer mandate or authorize a purchase. A product is searchable as an agent offer only when its product status, Stripe MPP offering, and endpoint are all eligible.

## Architecture

```text
Browser
  -> Next.js BFF
  -> Node API
  -> Supabase Postgres

Browser
  -> Next.js BFF
  -> Railway Agent service
  -> OpenAI Responses API

Node API
  -> payment adapter
```

The agent can interpret requests, call bounded catalog tools, and propose or select from backend-returned products. The Node API remains the sole authorization and payment authority. Agent signatures are evidence, not permission.

## Payment status

The repository contains Stripe MPP support and sandbox configuration. The deployed frontend must not be described as a live-money marketplace checkout. Live Stripe use remains blocked by the production runbook gates for provider verification, fraud controls, refunds, reconciliation, webhooks, and explicit approval.

## Environment

Configure the frontend server with:

```dotenv
BACKEND_API_URL=https://<node-api-domain>
AGENT_SERVICE_URL=https://<agent-domain>
AGENT_SERVICE_TOKEN=<agent-service-token>
```

These values are server-only. Never prefix them with `NEXT_PUBLIC_`, commit them, or expose them in browser code. The agent-to-API credential is a separate relationship from the BFF-to-agent credential.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. For the full stack, configure the API and agent services first, apply all required Supabase migrations, then set `BACKEND_API_URL`, `AGENT_SERVICE_URL`, and the server-side credentials in the frontend environment.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The frontend test suite currently reports 65 passing tests. The API and agent suites must also pass before treating a full-stack change as verified. The optional live OpenAI smoke test is not evidence when skipped.

## Related documentation

- [`../docs/README.md`](../docs/README.md) - product architecture and security argument.
- [`../docs/transfer-log.md`](../docs/transfer-log.md) - detailed handoff, decisions, risks, and next steps.
- [`../api/docs/stripe-mpp-production-runbook.md`](../api/docs/stripe-mpp-production-runbook.md) - live-money gates.
- [`../agent/docs/backend-contract.md`](../agent/docs/backend-contract.md) - agent-to-backend contract.
