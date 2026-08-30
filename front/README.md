# Nomad unified commerce platform

Nomad is a unified Buyer and Merchant frontend for governed, fixed-price agentic commerce. Buyers define purchasing mandates; Merchants publish structured products and audit the proof behind agent-originated orders.

The Buyer browser communicates through the Next.js backend proxy. The Merchant workspace authenticates with Supabase and reads only RLS-scoped projections; product, publish, and refund-case commands are allowlisted calls to the Node API. No browser receives a service-role or Stripe secret.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Merchant demo authentication and populated in-memory projections are enabled automatically during `npm run dev`, so the complete workspace can be explored without Supabase credentials. Use the **Explore demo workspace** button on `/merchant/login`, or open a Merchant route directly. Demo catalog and refund-case changes reset when the development server restarts.

For the deployed hackathon demo, set `NEXT_PUBLIC_MERCHANT_MOCK_AUTH=true` in the frontend service and redeploy. This exposes the same **Explore demo workspace** button without requiring registration. Keep the variable unset or `false` in any environment connected to real Merchant data.

To exercise the real authentication flow locally, copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_MERCHANT_MOCK_AUTH=false`, and configure `BACKEND_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The backend URL remains server-only. The Supabase publishable key is intentionally public and relies on RLS; never expose the Supabase secret key.

Routes:

- `/` — unified Buyer/Merchant landing
- `/assistant` — Buyer shopping agent
- `/merchant/login` — Merchant email/password access
- `/merchant/dashboard`, `/merchant/orders`, `/merchant/catalog`, `/merchant/finance` — protected Merchant workspace

## Deterministic demo prompts

- `Buy an ultrawide monitor up to $300` — creates a mandate and completes a mocked purchase after approval.
- `Find me a monitor` — asks for missing size and budget details.
- `Track a 34-inch ultrawide monitor under $220` — activates monitoring and adds the mandate to `/scheduled`.
- `Test payment challenge` — exercises the intercepted HTTP 402 UI state.

Approval uses an explicit simulated biometric dialog. No native credential or real payment data is requested.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The real integration path is `component → service → /api/backend/* → api/`. The current chat and mock purchase flows stay isolated until `api/` exposes its agent-adapter contract and issues the required agent execution proof.
