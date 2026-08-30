# Vero

Vero is a governed agentic commerce platform for buyers and merchants. Buyers define bounded mandates. Agents discover products and act only through evidence that the Node API revalidates against current authorization state.

## Live application

Open the deployed frontend:

<https://vero-kappa-umber.vercel.app>

The deployment currently serves the public Buyer and Merchant landing page. It is a frontend deployment, not proof that every backend dependency is healthy.

## Try the buyer flow

1. Open the live URL.
2. Select **Buyer**.
3. Create an account or sign in.
4. Complete native passkey setup when WebAuthn is available. The device may use biometrics, a PIN, or another local verifier.
5. If native enrollment is unavailable, use **Continue without passkey (demo)** only for a sandbox demonstration. This is not native WebAuthn or production authentication.
6. Open the Buyer assistant.
7. Try one of these prompts:

```text
Buy an ultrawide monitor up to $300
Find me a monitor
Track a 34-inch ultrawide monitor under $220
```

Review the structured response before approving a mandate. Browsing and product discovery do not approve a purchase. A purchase flow requires a fresh approval and backend authorization.

## Try the merchant flow

1. Select **Merchant** on the landing page, or open <https://vero-kappa-umber.vercel.app/merchant/login>.
2. Create or sign in to a merchant account.
3. Use the merchant workspace to manage the fixed-price catalog, orders, and finance projections.
4. Publish structured product data before expecting buyer-agent discovery.

The buyer assistant is available at `/assistant`. Protected routes redirect unauthenticated users to the landing page. Conversation history, mandates, passkeys, merchant commands, and payment decisions use server-side routes.

## What is authoritative

```text
Browser
  -> Next.js BFF
  -> Node API
  -> Supabase Postgres

Browser
  -> Next.js BFF
  -> Railway Agent
  -> OpenAI

Node API
  -> payment adapter
```

The agent can interpret requests, call bounded catalog tools, and select from products returned by the backend. It does not receive user passkeys, payment credentials, Supabase service keys, or unrestricted authorization. The Node API is the only authorization and payment authority. Agent signatures are evidence, not permission.

## Current boundaries

- The live Vercel URL proves that the frontend is serving.
- Full chat and run behavior also requires the configured Node API, Railway agent, OpenAI, Supabase migrations, and server-side tokens.
- Stripe MPP support is sandbox-oriented and controlled. Do not describe the deployment as live-money external marketplace checkout.
- The demo passkey path is explicitly sandbox-only.
- The catalog seed and ranked marketplace search require their Supabase migrations and sandbox catalog activation.
- The current agent run store has durability and multi-replica limitations. Check the transfer log before scaling or demonstrating restart recovery.

## Repository layout

- `api/` - Node.js authority API, Supabase repositories, mandates, proofs, payments, merchant platform, and audit evidence.
- `agent/` - OpenAI chat, bounded catalog tools, agent identity, signed proofs, and run execution contracts.
- `front/` - Next.js frontend, WebAuthn UI, BFF routes, buyer workspace, and merchant workspace.
- `docs/` - architecture, decision records, deployment notes, and operational handoff.

## Run locally

Prerequisites: Node.js 22, a configured Supabase project, sandbox Stripe credentials, and an OpenAI API key.

```bash
npm --prefix api install
npm --prefix agent install
npm --prefix front install

npm --prefix api run dev
npm --prefix agent run dev
npm --prefix front run dev
```

Open <http://localhost:3000>. Configure server-only values such as `BACKEND_API_URL`, `AGENT_SERVICE_URL`, `AGENT_SERVICE_TOKEN`, `AGENT_BACKEND_TOKEN`, `SESSION_SECRET`, and provider credentials in the appropriate service environment. Never use `NEXT_PUBLIC_` for a secret.

Apply the required Supabase migrations before exercising backend-backed flows. Do not commit environment files or credentials.

## Verification

```bash
npm --prefix api test
npm --prefix api run typecheck
npm --prefix api run build

npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build

npm --prefix front test
npm --prefix front run typecheck
npm --prefix front run build
```

The current workspace verification recorded 127 passing API tests, 52 passing agent tests with 1 skipped opt-in live OpenAI test, and 65 passing frontend tests. A skipped live test is not evidence that the external dependency is available.

## Documentation

- [Product architecture and security argument](docs/README.md)
- [Transfer log and decision record](docs/transfer-log.md)
- [Frontend and live deployment guide](front/README.md)
- [Backend contract](agent/docs/backend-contract.md)
- [Chat gateway architecture](agent/docs/api-gateway-chat-architecture.md)
- [Supabase architecture decision](api/docs/adr-0001-supabase-primary-data-platform.md)
- [Stripe MPP production runbook](api/docs/stripe-mpp-production-runbook.md)
