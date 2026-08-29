# Nomad buyer assistant

Nomad is the buyer-facing frontend for a governed AI shopping assistant. The conversational agent and purchase orchestration remain simulated until the backend is configured with its separate agent API.

The browser communicates only with this Next.js application. Its `/api/backend/*` route proxies allowlisted requests to the Node backend in `../api`; it never calls Supabase, Stripe, or an agent API directly.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and set `BACKEND_API_URL`. Use `http://localhost:3000` locally, then replace it with the deployed `api` service URL. Keep this variable server-only: do not rename it with a `NEXT_PUBLIC_` prefix.

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
