import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { HttpBackendAdapter, type SignatureRequest } from '../src/adapters.js';
import {
  DEMO_APPROVE_ONCE_RESOLUTION_ID,
  DEMO_MANDATE_ID,
  DemoBackend,
  createDemoOffers,
} from '../src/demo.js';
import { decodeAgentProof, sha256Utf8, verifyAgentProof } from '../src/crypto.js';
import { silentStepLogger } from '../src/graph.js';
import { AgentService } from '../src/service.js';
import { FakeFlightSelector } from '../src/selector.js';
import { waitForStatus } from './helpers.js';

const backendToken = 'backend-contract-token-12345';

async function readRawBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

test('HTTP adapter contract preserves the exact signed body and Ed25519 proof on present and resume', async (t) => {
  const fixedNow = new Date('2026-08-29T20:00:00.000Z');
  const authority = new DemoBackend({
    now: () => fixedNow,
    offers: [createDemoOffers()[1]!],
  });
  const requests: Array<{
    method: string;
    path: string;
    rawBody: string;
    encodedProof?: string;
    idempotencyKey?: string;
  }> = [];

  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${backendToken}`);
      const method = request.method ?? 'GET';
      const path = request.url ?? '/';
      const rawBody = await readRawBody(request);
      requests.push({
        method,
        path,
        rawBody,
        ...(typeof request.headers['x-agent-proof'] === 'string'
          ? { encodedProof: request.headers['x-agent-proof'] }
          : {}),
        ...(typeof request.headers['idempotency-key'] === 'string'
          ? { idempotencyKey: request.headers['idempotency-key'] }
          : {}),
      });

      if (method === 'GET' && path === `/v1/mandates/${DEMO_MANDATE_ID}/agent-view`) {
        sendJson(response, 200, { ok: true, data: await authority.getMandate(DEMO_MANDATE_ID) });
        return;
      }
      if (method === 'POST' && path === '/v1/catalog/flights/search') {
        sendJson(response, 200, {
          ok: true,
          data: await authority.searchFlights(JSON.parse(rawBody)),
        });
        return;
      }
      if (method === 'POST' && path === '/v1/agent-proofs/sign') {
        sendJson(response, 200, {
          ok: true,
          data: await authority.sign(JSON.parse(rawBody) as SignatureRequest),
        });
        return;
      }
      if (method === 'POST' && path === '/v1/purchase-attempts') {
        sendJson(response, 200, {
          ok: true,
          data: await authority.presentPurchase({
            rawBody,
            encodedProof: String(request.headers['x-agent-proof']),
            idempotencyKey: String(request.headers['idempotency-key']),
          }),
        });
        return;
      }
      const resumeMatch = path.match(/^\/v1\/purchase-attempts\/([^/]+)\/resume$/);
      if (method === 'POST' && resumeMatch?.[1]) {
        sendJson(response, 200, {
          ok: true,
          data: await authority.resumePurchase(decodeURIComponent(resumeMatch[1]), {
            rawBody,
            encodedProof: String(request.headers['x-agent-proof']),
            idempotencyKey: String(request.headers['idempotency-key']),
          }),
        });
        return;
      }
      sendJson(response, 404, { ok: false, error: { code: 'NOT_FOUND' } });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: { code: 'TEST_SERVER_FAILURE' } });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The contract server did not bind to a TCP port.');
  }

  const adapters = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });
  const service = new AgentService({
    adapters,
    selector: new FakeFlightSelector(),
    logger: silentStepLogger,
    now: () => fixedNow,
  });
  const started = service.start(randomUUID(), {
    goal: 'Buy a flight to Córdoba below USD 150',
    mandateId: DEMO_MANDATE_ID,
  });
  await waitForStatus(service, started.runId, 'waiting_for_human');
  service.resume(started.runId, randomUUID(), {
    approvalResolutionId: DEMO_APPROVE_ONCE_RESOLUTION_ID,
  });
  const completed = await waitForStatus(service, started.runId, 'completed');
  assert.equal(completed.result?.outcome, 'allowed');

  const presentations = requests.filter((request) => request.path === '/v1/purchase-attempts'
    || request.path.endsWith('/resume'));
  assert.equal(presentations.length, 2);
  assert.deepEqual(requests.map((request) => `${request.method} ${request.path.includes('/purchase-attempts/') && request.path.endsWith('/resume') ? '/v1/purchase-attempts/:id/resume' : request.path}`), [
    `GET /v1/mandates/${DEMO_MANDATE_ID}/agent-view`,
    'POST /v1/catalog/flights/search',
    'POST /v1/agent-proofs/sign',
    'POST /v1/purchase-attempts',
    'POST /v1/agent-proofs/sign',
    'POST /v1/purchase-attempts/:id/resume',
  ]);

  for (const presentation of presentations) {
    assert.match(presentation.idempotencyKey ?? '', /^[0-9a-f-]{36}$/);
    const proof = decodeAgentProof(presentation.encodedProof ?? '');
    assert.equal(proof.bodySha256, sha256Utf8(presentation.rawBody));
    assert.equal(proof.expiresAt - proof.issuedAt, 60);
    verifyAgentProof({
      now: Math.floor(fixedNow.getTime() / 1_000),
      proof,
      publicKeyJwk: authority.publicKeyJwk,
      request: {
        bodySha256: sha256Utf8(presentation.rawBody),
        mandateId: DEMO_MANDATE_ID,
        mandateVersion: 1,
        method: 'POST',
        path: presentation.path,
      },
    });
  }

  assert.equal(authority.presentations[0]?.rawBody, presentations[0]?.rawBody);
  assert.equal(authority.presentations[1]?.rawBody, presentations[1]?.rawBody);
});
