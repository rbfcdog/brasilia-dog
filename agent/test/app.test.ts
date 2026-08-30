import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.js';
import type { AgentAdapters, CatalogProduct } from '../src/adapters.js';
import {
  DEMO_APPROVE_ONCE_RESOLUTION_ID,
  DemoBackend,
  createDemoOffers,
} from '../src/demo.js';
import { silentStepLogger } from '../src/graph.js';
import { AgentService } from '../src/service.js';
import { FakeFlightSelector } from '../src/selector.js';

const serviceToken = 'test-agent-service-token-12345';

async function startAgentServer(backend: AgentAdapters = new DemoBackend()): Promise<{
  baseUrl: string;
  server: Server;
}> {
  const service = new AgentService({
    adapters: backend,
    selector: new FakeFlightSelector(),
    logger: silentStepLogger,
  });
  const server = createServer(createApp({
    service: Object.assign(service, {
      identity: () => ({
        publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'public-key-material' },
        fingerprint: 'a'.repeat(64),
      }),
    }),
    serviceToken,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The test server did not bind to a TCP port.');
  }
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function authenticatedHeaders(idempotencyKey?: string): HeadersInit {
  return {
    Authorization: `Bearer ${serviceToken}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

async function readJson(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function pollRun(baseUrl: string, runId: string, status: string): Promise<Record<string, any>> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/v1/agent-runs/${runId}`, {
      headers: authenticatedHeaders(),
    });
    const body = await readJson(response);
    if (body.data?.status === status) {
      return body.data as Record<string, any>;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Run ${runId} did not reach ${status}.`);
}

test('health and public-only agent identity are public while operational v1 routes require bearer authentication', async (t) => {
  const { baseUrl, server } = await startAgentServer();
  t.after(() => closeServer(server));

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await readJson(health), { status: 'ok' });

  const identity = await fetch(`${baseUrl}/v1/identity`);
  assert.equal(identity.status, 200);
  const identityBody = await readJson(identity);
  assert.deepEqual(identityBody.data.publicKeyJwk, {
    kty: 'OKP', crv: 'Ed25519', x: 'public-key-material',
  });
  assert.equal(identityBody.data.publicKeyJwk.d, undefined);

  const missing = await fetch(`${baseUrl}/v1/agent-runs/unknown`);
  assert.equal(missing.status, 401);
  assert.equal((await readJson(missing)).error.code, 'UNAUTHORIZED');

  const wrong = await fetch(`${baseUrl}/v1/agent-runs/unknown`, {
    headers: { Authorization: 'Bearer wrong-token' },
  });
  assert.equal(wrong.status, 401);
});

test('authenticated product route exposes the backend catalog harness', async (t) => {
  const demo = new DemoBackend();
  const products: CatalogProduct[] = [{
    id: 'product-1',
    slug: 'ultrawide-monitor-buying-guide',
    name: 'Ultrawide monitor buying guide',
    description: 'Current comparison data.',
    status: 'published',
    metadata: { category: 'electronics' },
    offering: {
      id: 'offering-1',
      rail: 'stripe_mpp',
      amountMinor: 250,
      currency: 'usd',
      scale: 2,
      networkId: 'profile_test_example',
      active: true,
    },
    endpoint: {
      id: 'endpoint-1',
      method: 'GET',
      path: '/v1/products/ultrawide-monitor-buying-guide/mpp',
      enabled: true,
    },
  }];
  const { baseUrl, server } = await startAgentServer({
    mandates: demo,
    catalog: demo,
    signer: demo,
    purchases: demo,
    products: { listProducts: async () => products, searchProducts: async () => products },
  });
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/v1/products`, { headers: authenticatedHeaders() });

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), { ok: true, data: { products } });
});

test('run creation, polling, and start idempotency follow the public contract', async (t) => {
  const { baseUrl, server } = await startAgentServer();
  t.after(() => closeServer(server));
  const idempotencyKey = randomUUID();
  const request = {
    goal: 'Buy a flight to Córdoba below USD 150',
    mandateId: 'mandate-vuelaya-cordoba',
  };

  const firstResponse = await fetch(`${baseUrl}/v1/agent-runs`, {
    method: 'POST',
    headers: authenticatedHeaders(idempotencyKey),
    body: JSON.stringify(request),
  });
  assert.equal(firstResponse.status, 202);
  const first = await readJson(firstResponse);
  assert.equal(first.ok, true);
  assert.equal(first.data.status, 'queued');

  const repeatResponse = await fetch(`${baseUrl}/v1/agent-runs`, {
    method: 'POST',
    headers: authenticatedHeaders(idempotencyKey),
    body: JSON.stringify(request),
  });
  const repeat = await readJson(repeatResponse);
  assert.equal(repeatResponse.status, 202);
  assert.equal(repeat.data.runId, first.data.runId);

  const completed = await pollRun(baseUrl, first.data.runId, 'completed');
  assert.equal(completed.result.outcome, 'allowed');
  assert.deepEqual(completed.events.map((event: { type: string }) => event.type), [
    'run_started',
    'mandate_loaded',
    'offers_discovered',
    'offer_selected',
    'purchase_presented',
    'purchase_completed',
  ]);

  const conflict = await fetch(`${baseUrl}/v1/agent-runs`, {
    method: 'POST',
    headers: authenticatedHeaders(idempotencyKey),
    body: JSON.stringify({ ...request, goal: 'A different goal' }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await readJson(conflict)).error.code, 'IDEMPOTENCY_CONFLICT');
});

test('resume requires a UUID, is idempotent, and only accepts waiting runs', async (t) => {
  const backend = new DemoBackend({ offers: [createDemoOffers()[1]!] });
  const { baseUrl, server } = await startAgentServer(backend);
  t.after(() => closeServer(server));
  const startResponse = await fetch(`${baseUrl}/v1/agent-runs`, {
    method: 'POST',
    headers: authenticatedHeaders(randomUUID()),
    body: JSON.stringify({
      goal: 'Buy a flight to Córdoba below USD 150',
      mandateId: 'mandate-vuelaya-cordoba',
    }),
  });
  const runId = (await readJson(startResponse)).data.runId as string;
  await pollRun(baseUrl, runId, 'waiting_for_human');

  const invalidKey = await fetch(`${baseUrl}/v1/agent-runs/${runId}/resume`, {
    method: 'POST',
    headers: authenticatedHeaders('not-a-uuid'),
    body: JSON.stringify({ approvalResolutionId: DEMO_APPROVE_ONCE_RESOLUTION_ID }),
  });
  assert.equal(invalidKey.status, 400);

  const resumeKey = randomUUID();
  const resumeBody = { approvalResolutionId: DEMO_APPROVE_ONCE_RESOLUTION_ID };
  const firstResume = await fetch(`${baseUrl}/v1/agent-runs/${runId}/resume`, {
    method: 'POST',
    headers: authenticatedHeaders(resumeKey),
    body: JSON.stringify(resumeBody),
  });
  assert.equal(firstResume.status, 202);

  const duplicateResume = await fetch(`${baseUrl}/v1/agent-runs/${runId}/resume`, {
    method: 'POST',
    headers: authenticatedHeaders(resumeKey),
    body: JSON.stringify(resumeBody),
  });
  assert.equal(duplicateResume.status, 202);

  await pollRun(baseUrl, runId, 'completed');
  const lateNewResume = await fetch(`${baseUrl}/v1/agent-runs/${runId}/resume`, {
    method: 'POST',
    headers: authenticatedHeaders(randomUUID()),
    body: JSON.stringify(resumeBody),
  });
  assert.equal(lateNewResume.status, 409);
  assert.equal((await readJson(lateNewResume)).error.code, 'RUN_NOT_WAITING');

  const changedDuplicate = await fetch(`${baseUrl}/v1/agent-runs/${runId}/resume`, {
    method: 'POST',
    headers: authenticatedHeaders(resumeKey),
    body: JSON.stringify({ approvalResolutionId: 'approval:deny' }),
  });
  assert.equal(changedDuplicate.status, 409);
  assert.equal((await readJson(changedDuplicate)).error.code, 'IDEMPOTENCY_CONFLICT');
});
