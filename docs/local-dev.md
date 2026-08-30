# Local development

All three services (`api`, `agent`, `front`) are Node 22, so development runs in
a single dev container rather than three. Source is bind-mounted, so every save
hot-reloads without rebuilding an image.

## Start

1. **Open in Dev Container** (Command Palette → *Dev Containers: Reopen in Container*).
   First open copies `.env.example` to `.env` and installs dependencies.
2. Put your key in `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```
   Then rebuild once so the container picks it up (*Dev Containers: Rebuild Container*).
   Editing `.env` later always requires a rebuild — it is injected at container start.
3. The **Dev: all** task starts automatically when the repository opens in the
   container. Its readiness terminal confirms the API, agent, frontend, and the
   frontend-to-API proxy before declaring the stack ready. If automatic tasks
   were previously disabled for this workspace, run Command Palette →
   *Tasks: Run Build Task* (`Cmd+Shift+B`) once.

Three terminals open, one per service:

| Service | URL | Reload |
| --- | --- | --- |
| api | http://localhost:3000/health | `tsx watch` |
| agent | http://localhost:3001/health | `tsx watch` |
| front | http://localhost:3002 | Next Fast Refresh |

Run a single service instead with *Tasks: Run Task* → **Dev: api** / **Dev: agent** / **Dev: front**.
Tests: **Test: all**, or one project at a time.

You can rerun the same readiness gate at any time with:

```bash
node scripts/verify-local.mjs
```

## How configuration flows

There is one `.env` at the repository root, injected into the container with
`docker run --env-file`, so every process inherits it.

This matters because **the agent service does not load dotenv** — `agent/src/config.ts`
parses `process.env` directly with zod. A file at `agent/.env` would be ignored.
Injecting at the container level is what makes its configuration resolve, and it
also removes the need to keep three separate `.env` files in sync.

`PORT` is deliberately not in `.env`: the three services need different values,
so each is set per task in `.vscode/tasks.json`.

The frontend BFF uses `BACKEND_API_URL=http://localhost:3000` and
`AGENT_SERVICE_URL=http://localhost:3001`. The local frontend task also sets
these non-secret URLs explicitly, so restarting that task is enough after a
configuration change.

Because it is consumed by `--env-file`, values must be bare — no quotes, no
spaces around `=`, no `${VAR}` expansion.

### Tokens

`AGENT_SERVICE_TOKEN` and `AGENT_BACKEND_TOKEN` hold the same value locally.
The api validates inbound agent calls against `AGENT_SERVICE_TOKEN`; the agent
presents `AGENT_BACKEND_TOKEN`. They are separate names in production so the
two hops can be rotated independently.

### Supabase

Leave all `SUPABASE_*` empty to run self-contained. In `ADAPTER_MODE=demo`, the
agent uses its in-memory product and flight catalogs while the API keeps its
database-backed routes disabled. Populate the Supabase variables together to
exercise the database-backed repositories in `ADAPTER_MODE=http`; the target
database must already have the migrations from `api/supabase/migrations`.

## Why node_modules lives in a volume

The host installs macOS binaries; the container is Linux. Sharing `node_modules`
breaks Next.js SWC and any native module. Each service gets a Docker volume, so
host and container installs stay independent and you can still run things
natively on the host if you want.

If dependencies change, rerun the install for that service inside the container
(`npm --prefix front install`), or rebuild the container.

## Relationship to production

| Path | What runs it |
| --- | --- |
| `api/Dockerfile`, `agent/Dockerfile` | Railway. These are the real deploy artifacts — keep them accurate |
| `front/` | Vercel, built from `package.json`. It does not use a Dockerfile, which is why none exists |
| `.devcontainer/` | Development only. Never a deploy target |
