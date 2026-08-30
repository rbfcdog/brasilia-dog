# Nomad unified commerce platform

Nomad is a unified Buyer and Merchant frontend for governed, fixed-price agentic commerce. Buyers define purchasing mandates; Merchants publish structured products and audit the proof behind agent-originated orders.

The browser communicates only with same-origin Next.js BFF routes. Authentication, database access, merchant projections, passkeys, conversations, and payment commands are handled by the Node API. The frontend contains no Supabase SDK, project URL, publishable key, service-role key, or direct database access.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Configure `BACKEND_API_URL` in the Next.js server environment. The browser signs in through `/api/auth/*`; the BFF stores API-issued credentials in secure HttpOnly cookies and forwards them only to the Node API.

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
