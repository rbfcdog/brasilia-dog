# VuelaYa minimal agent

An independently deployable Node.js service that discovers a VuelaYa flight, uses an LLM to select an offer, signs the agent's claim through a remote signer, and presents it to the backend authority. The backend—not the model—returns the only accepted outcomes: `allowed`, `rejected`, or `escalation_required`.

This is the minimum functional implementation for the hackathon. It deliberately does not import from `api/` or `front/`, access Supabase or payment data, expose private signing keys, or authorize purchases locally.

## Runtime flow

```text
load_mandate
  -> search_offers
  -> select_offer
  -> build_agent_claim
  -> request_remote_signature
  -> present_purchase
       |-> allowed  -> completed
       |-> rejected -> rejected
       `-> escalation_required
             -> wait_for_human (LangGraph interrupt)
             -> sign_resume_request
             -> resume_purchase
                  |-> allowed  -> completed
                  `-> rejected -> rejected
```

The LLM sees only the goal, the safe mandate projection, and untrusted offer data. Its output is constrained by strict JSON Schema, then validated again with Zod. An offer ID must exist in the catalog response. Invalid model output gets one retry and then stops with `MODEL_OUTPUT_INVALID` before any purchase presentation.

## Requirements

- Node.js 22 or newer
- npm
- An OpenAI API key and an explicit model that supports Structured Outputs
- Docker for the image gate

## Setup

```bash
cd agent
npm ci
```

Use `.env.example` as a reference and set every required variable in the process environment. The service does not load `.env` files or print configuration values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | always | HTTP listen port |
| `AGENT_SERVICE_TOKEN` | always | Bearer secret used only by the trusted Next BFF |
| `OPENAI_API_KEY` | always | Server-side key for the Responses API |
| `OPENAI_MODEL` | always | Explicit model; there is no hardcoded fallback |
| `ADAPTER_MODE` | always | `demo` or `http` |
| `BACKEND_BASE_URL` | HTTP mode | Base URL for the authoritative backend |
| `AGENT_BACKEND_TOKEN` | HTTP mode | Agent-to-backend bearer credential |

The selected MVP model is `gpt-5.4-mini`: the offer-selection task is narrow but benefits from the reliability of the strongest current mini tier. It supports the Responses API and Structured Outputs. The slug remains an explicit environment value—there is no runtime default—so it can be changed and evaluated without a code release.

`ADAPTER_MODE=demo` uses the fixed VuelaYa catalog and a deterministic in-process authority while still using the real OpenAI selector. The demo data is limited to a Córdoba mandate for USD 150 and offers at USD 130 and USD 300.

Start from TypeScript during development:

```bash
npm run dev
```

Or run the same compiled JavaScript used in production:

```bash
npm run build
npm start
```

## Public HTTP API

`GET /health` is public. Every `/v1` route requires `Authorization: Bearer $AGENT_SERVICE_TOKEN`. The browser must never receive this token; the Next application calls these routes only from its BFF/server layer.

Start a run. `Idempotency-Key` must be a UUID:

```bash
curl -i http://localhost:3001/v1/agent-runs \
  -H "Authorization: Bearer $AGENT_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-4111-8111-111111111111" \
  --data '{"goal":"Buy a flight to Córdoba below USD 150","mandateId":"mandate-vuelaya-cordoba"}'
```

The response is `202` with a run ID. Poll it:

```bash
curl http://localhost:3001/v1/agent-runs/RUN_ID \
  -H "Authorization: Bearer $AGENT_SERVICE_TOKEN"
```

If the status is `waiting_for_human`, the frontend resolves the approval through the backend's own approval route. It then gives the agent only the opaque resolution ID:

```bash
curl -i http://localhost:3001/v1/agent-runs/RUN_ID/resume \
  -H "Authorization: Bearer $AGENT_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 22222222-2222-4222-8222-222222222222" \
  --data '{"approvalResolutionId":"approval:approve-once"}'
```

The `approval:approve-once` and `approval:deny` IDs are deterministic demo fixtures only. In HTTP mode the value is opaque and the backend validates it. Receiving a resolution ID is never treated as approval by the agent.

## Next BFF mapping

The expected frontend integration is intentionally small:

- A server action or route handler forwards start, poll, and resume requests to this service.
- The BFF creates UUID idempotency keys and stores/reuses them for client retries.
- The BFF maps the agent's English `status`, `events`, `result`, and `approvalRequest` objects to the existing UI.
- Human approval is submitted to the authoritative backend first. Only the returned `approvalResolutionId` is forwarded to `/resume`.
- `AGENT_SERVICE_TOKEN`, `AGENT_BACKEND_TOKEN`, and `OPENAI_API_KEY` remain server-only.

The complete backend contract is in [docs/backend-contract.md](docs/backend-contract.md).

## Tests and gates

The normal suite is hermetic and never calls OpenAI or a real backend:

```bash
npm ci
npm test
npm run typecheck
npm run build
docker build -t vuelaya-agent .
```

It covers the USD 130 allow path, USD 300 escalation with approve-once and deny, revocation before and during approval, mandate version/limit changes, expiry, signed-body integrity, wrong identity, nonce replay, proof expiry, prompt injection, invalid model IDs with one retry, dependency failures, API authentication, polling, idempotency, duplicate resume, and the HTTP backend contract.

The real OpenAI smoke is opt-in and must receive secrets through environment variables, never chat, source code, or logs:

```bash
OPENAI_API_KEY=... OPENAI_MODEL=... npm run test:live
```

## Docker and Railway

Build and run only compiled JavaScript:

```bash
docker build -t vuelaya-agent .
docker run --rm -p 3001:3001 \
  -e PORT=3001 \
  -e AGENT_SERVICE_TOKEN="$AGENT_SERVICE_TOKEN" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e OPENAI_MODEL="$OPENAI_MODEL" \
  -e ADAPTER_MODE=demo \
  vuelaya-agent
```

For Railway, create a separate service from this repository, set its root directory to `/agent`, use the included `Dockerfile`, configure `/health` as the health check, and add the runtime variables above. Do not share the browser-facing frontend environment with this service.

## Logs and limitations

Runtime logs are one-line JSON with only `runId`, graph step, duration, and outcome. They exclude goals, prompts, tokens, offer content, proof material, signatures, and secrets.

`MemorySaver` and `RunStore` are process memory only. A restart loses run polling history and interrupted checkpoints, and horizontal replicas cannot resume one another's runs. This is an accepted MVP limitation; move both checkpoints and run metadata to Postgres before production or multi-replica deployment.

The demo authority uses an ephemeral Ed25519 key that disappears on restart. HTTP mode uses the remote backend signer; the agent never receives a private key. Neither mode gives the agent access to Stripe, MPP, Supabase, raw cards, or WebAuthn private material.

## Troubleshooting

- `CONFIG_INVALID`: check that every always-required variable is non-empty; HTTP mode also needs both backend variables.
- `MODEL_OUTPUT_INVALID`: the model returned invalid structured output or a catalog ID that does not exist twice.
- `OPENAI_REQUEST_FAILED`: confirm the API key, explicit model access, and outbound connectivity.
- `BACKEND_REQUEST_FAILED`: check the backend URL/token and that all five contract routes are available.
- A run stuck after restart cannot be recovered in the MVP because checkpoints are in memory; start a new run with a new idempotency key.
