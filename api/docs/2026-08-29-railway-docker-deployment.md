# Railway Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stripe MPP API build and run as a non-root Docker container that Railway can health-check and expose.

**Architecture:** Railway builds from the API service root, `api/`. It installs only production dependencies, copies only API runtime source, and runs `src/index.js` as the unprivileged Node user. Railway injects runtime secrets and `PORT`; no `.env` file or credential is copied into the image. The Node process listens on all container interfaces so the Railway proxy can reach `GET /health`.

**Tech Stack:** Node.js 22, Docker, Railway Infrastructure as Code (`api/.railway/railway.ts`), `mppx`, Stripe Node SDK.

**Spec:** `api/README.md`, `api/docs/adr-0001-supabase-primary-data-platform.md`, and `api/docs/stripe-mpp-production-runbook.md`.

## Global Constraints

- The Docker image MUST contain no `.env`, credentials, Git history, source docs, or local `node_modules`.
- Railway MUST use `api/Dockerfile` and `api/.railway/railway.ts`, probe `GET /health`, and use the injected `PORT` value.
- The service MUST bind to `0.0.0.0`, not loopback-only `127.0.0.1`.
- Live MPP mode remains blocked by the existing `ALLOW_LIVE_MPP_TEST=true` gate.
- No raw card data, Stripe secret, MPP secret, or Supabase service-role key may be committed, logged, or placed in browser code.
- The MPP endpoint remains a controlled paid API resource, not marketplace checkout.

---

### Task 1: Container runtime and Railway configuration

**Files:**
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`
- Create: `api/.railway/railway.ts`

**Interfaces:**
- Consumes: `api/package.json`, `api/package-lock.json`, `api/src/index.js`
- Produces: a Docker image that starts with `npm start`; a Railway IaC service definition with Dockerfile build, `api` root directory, and `GET /health` readiness.

- [ ] **Step 1: Establish the failing container-build condition**

Run:

```bash
docker build --file api/Dockerfile --tag nextwave-stripe-mpp-api:railway api
```

Expected: FAIL because the API service root has no Dockerfile.

- [ ] **Step 2: Add the API-root Dockerfile**

```dockerfile
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
USER node

EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 3: Add `.dockerignore` and Railway health-check configuration**

```gitignore
.git
.env
.env.*
node_modules
coverage
.DS_Store
test
```

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 4: Build the image**

Run:

```bash
docker build --file api/Dockerfile --tag nextwave-stripe-mpp-api:railway api
```

Expected: PASS; the image contains production dependencies and `src` only.

### Task 2: Container network binding

**Files:**
- Modify: `api/src/index.js:15-16`

**Interfaces:**
- Consumes: `config.port` from `api/src/config.js`
- Produces: a Node HTTP server reachable through the container network on the Railway-injected port.

- [ ] **Step 1: Create a runtime failure proof**

Run the built image with sandbox-shaped placeholder configuration and query its published `GET /health` endpoint from the host. With loopback-only binding, the published port is not reachable from outside the container.

```bash
docker run --rm --name nextwave-mpp-smoke -p 3100:3100 \
  -e PORT=3100 \
  -e STRIPE_MODE=sandbox \
  -e STRIPE_SECRET_KEY=sk_test_example \
  -e STRIPE_PROFILE_ID=profile_test_example \
  -e MPP_SECRET_KEY=12345678901234567890123456789012 \
  nextwave-stripe-mpp-api:railway
```

In another terminal:

```bash
curl --fail --silent --show-error http://127.0.0.1:3100/health
```

Expected before the change: connection failure or no HTTP 200.

- [ ] **Step 2: Bind the server to all container interfaces**

Replace the loopback host in `api/src/index.js`:

```js
server.listen(config.port, '0.0.0.0', () => {
  console.log(`Stripe MPP ${config.mode} service listening on http://0.0.0.0:${config.port}`);
});
```

- [ ] **Step 3: Rebuild and smoke-test the container**

Use the same `docker run` command and assert:

```bash
curl --fail --silent --show-error http://127.0.0.1:3100/health
```

Expected: `{"status":"ok"}`.

Then query the protected resource:

```bash
curl --include --silent http://127.0.0.1:3100/paid
```

Expected: `HTTP/1.1 402` and a `www-authenticate: Payment ...` challenge. Placeholder credentials prove routing and challenge construction only; they do not prove settlement.

### Task 3: Operator documentation and regression verification

**Files:**
- Modify: `api/README.md`
- Test: `api/test/*.test.js`

**Interfaces:**
- Consumes: root `Dockerfile`, `railway.json`, the existing `GET /health` endpoint, Railway project environment variables.
- Produces: reproducible Railway setup instructions and passing API regressions.

- [ ] **Step 1: Document Railway setup**

Add a section that tells an operator to create a Railway service from the repository root, leave Dockerfile detection enabled, configure the listed variables in Railway's service environment, set the health check to `/health`, generate the public domain, and test `/health` before `/paid`.

List only variable names and expected prefixes:

```text
STRIPE_MODE=sandbox
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PROFILE_ID=profile_test_...
MPP_SECRET_KEY=<at least 32 random bytes>
```

State that Railway supplies `PORT`, and that no variable value belongs in Git or chat. Keep real validation and live-money gates linked to the existing runbook.

- [ ] **Step 2: Run regression tests**

Run:

```bash
cd api && npm test
```

Expected: all existing configuration, routing, MPP challenge, and HTTP adapter tests pass.

- [ ] **Step 3: Verify the staged deployment artifacts**

Run:

```bash
git diff --cached --check
```

Expected: no whitespace errors.
