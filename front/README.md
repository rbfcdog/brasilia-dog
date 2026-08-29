# Nomad buyer assistant

Nomad is the buyer-facing frontend for a governed AI shopping assistant. It turns natural-language requests into explicit purchase mandates, asks the buyer for approval, and either completes a mocked purchase or schedules continued monitoring.

This slice is intentionally self-contained. AI analysis, biometrics, merchant search, and purchase execution are simulated through typed Next.js route handlers and service abstractions.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Supabase is optional. Copy `.env.example` to `.env.local` and set only the public project URL and publishable key if you want the profile page to observe a real auth session. The app never accepts a service-role key.

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

The main browser flow follows `component → hook → service → mock route handler`, keeping components independent from the future Node, AI, mandate, and payment integrations.
