# Local development

All three services (`api`, `agent`, `front`) are Node 22, so development runs in
a single dev container rather than three. Source is bind-mounted, so every save
hot-reloads without rebuilding an image.

## Start

1. **Open in Dev Container** (Command Palette → *Dev Containers: Reopen in Container*).
   First open copies `.env.example` to `.env`, installs dependencies, and
   provisions the Chromium binary used by the end-to-end tests.
2. Put your key in `.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```
   Then rebuild once so the container picks it up (*Dev Containers: Rebuild Container*).
   Editing `.env` later always requires a rebuild — it is injected at container start.
3. The **Dev: all** task starts automatically when the repository opens in the
   container. Its readiness terminal confirms the API, agent, frontend,
   frontend-to-API proxy, and read-only Supabase access from both backend
   services before declaring the stack ready. If automatic tasks
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

The API and agent also read the repository-root `.env` as a fallback when they
run outside the dev container. Existing process variables remain authoritative,
so container-level injection still gives all three processes one consistent
configuration snapshot and removes the need to maintain separate service files.

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

The current runtime uses `ADAPTER_MODE=http` and requires `SUPABASE_URL` plus a
server credential (`SUPABASE_SECRET_KEY`). Configure the related public frontend
values together. The target database must have every migration from
`api/supabase/migrations`; the readiness gate performs read-only queries through
both the API and agent so a missing credential or schema fails visibly.

## Why node_modules lives in a volume

The host installs macOS binaries; the container is Linux. Sharing `node_modules`
breaks Next.js SWC and any native module. Each service gets a Docker volume, so
host and container installs stay independent and you can still run things
natively on the host if you want.

The Playwright Chromium cache also has its own volume. This keeps the browser
available after container rebuilds while still allowing Playwright to install a
new matching revision when its package version changes.

If dependencies change, rerun the install for that service inside the container
(`npm --prefix front install`), or rebuild the container.

## Relationship to production

| Path | What runs it |
| --- | --- |
| `api/Dockerfile`, `agent/Dockerfile` | Railway. These are the real deploy artifacts — keep them accurate |
| `front/` | Vercel, built from `package.json`. It does not use a Dockerfile, which is why none exists |
| `.devcontainer/` | Development only. Never a deploy target |
