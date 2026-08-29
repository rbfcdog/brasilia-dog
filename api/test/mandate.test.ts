import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionService } from '../src/services/session-service.js';

const testSessionService = {
  verifySession: async (token: string) => token === 'test-session' ? {
    token, userId: 'user-1', credentialId: 'credential-1', issuedAt: 0, expiresAt: Date.now() + 60_000,
  } : null,
} as unknown as SessionService;

function authenticatedRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set('authorization', 'Bearer test-session');
  return new Request(input, { ...init, headers });
}

import { createApp } from '../src/http/app.js';
import type { AgentIdentity, MppHandler, Mandate, MandateScope } from '../src/domain/types.js';
import type { AgentIdentityRepository } from '../src/repositories/agent-identity-repository.js';
import type { MandateRepository } from '../src/repositories/mandate-repository.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

const agentIdentityRepository = {
  getIdentity: async (id: string): Promise<AgentIdentity | null> => ({
    id,
    ownerId: 'user-1',
    displayName: 'Test Agent',
    status: 'active',
    createdAt: new Date().toISOString(),
  }),
} as unknown as AgentIdentityRepository;

class MockMandateRepository implements Pick<MandateRepository,
  'create' | 'getMandate' | 'getActiveMandate' | 'listMandates' | 'revoke' | 'getUsage'
> {
  private readonly mandates = new Map<string, Mandate>();
  private counter = 0;

  async create(params: {
    ownerId: string;
    agentIdentityId: string;
    scope: MandateScope;
    maxAmountMinor: number;
    currency: string;
    expiresAt: string;
  }): Promise<Mandate> {
    const id = `mandate-${++this.counter}`;
    const mandate: Mandate = {
      id,
      ownerId: params.ownerId,
      agentIdentityId: params.agentIdentityId,
      version: 1,
      status: 'active',
      scope: params.scope,
      maxAmountMinor: params.maxAmountMinor,
      currency: params.currency,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.mandates.set(id, mandate);
    return mandate;
  }

  async getMandate(mandateId: string): Promise<Mandate | null> {
    return this.mandates.get(mandateId) ?? null;
  }

  async getActiveMandate(agentIdentityId: string): Promise<Mandate | null> {
    for (const m of this.mandates.values()) {
      if (m.agentIdentityId === agentIdentityId && m.status === 'active') {
        if (new Date(m.expiresAt).getTime() > Date.now()) {
          return m;
        }
      }
    }
    return null;
  }

  async listMandates(ownerId: string): Promise<Mandate[]> {
    return [...this.mandates.values()].filter((m) => m.ownerId === ownerId);
  }

  async revoke(mandateId: string): Promise<void> {
    const m = this.mandates.get(mandateId);
    if (m) {
      m.status = 'revoked';
    }
  }

  async getUsage(): Promise<{ totalSpentMinor: number; purchaseCount: number }> {
    return { totalSpentMinor: 0, purchaseCount: 0 };
  }
}

function createMockRepo() {
  return new MockMandateRepository();
}

const futureDate = new Date(Date.now() + 86400000).toISOString();

test('POST /v1/mandates creates a mandate', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest('http://localhost/v1/mandates', {
      method: 'POST',
      body: JSON.stringify({
        ownerId: 'user-1',
        agentIdentityId: 'agent-1',
        scope: { allowedProductSlugs: ['market-signal-sandbox'] },
        maxAmountMinor: 500,
        currency: 'usd',
        expiresAt: futureDate,
      }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mandate.status, 'active');
  assert.equal(body.mandate.maxAmountMinor, 500);
  assert.equal(body.mandate.currency, 'usd');
  assert.equal(body.mandate.version, 1);
});

test('POST /v1/mandates rejects a request with missing fields', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest('http://localhost/v1/mandates', {
      method: 'POST',
      body: JSON.stringify({ ownerId: 'user-1' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 400);
});

test('GET /v1/mandates lists mandates by owner', async () => {
  const repo = createMockRepo();
  await repo.create({
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    scope: {},
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: futureDate,
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest('http://localhost/v1/mandates?ownerId=user-1', { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mandates.length, 1);
});

test('GET /v1/mandates/:id returns a single mandate', async () => {
  const repo = createMockRepo();
  const mandate = await repo.create({
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    scope: {},
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: futureDate,
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest(`http://localhost/v1/mandates/${mandate.id}`, { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mandate.id, mandate.id);
});

test('GET /v1/mandates/:id returns 404 for unknown mandate', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest('http://localhost/v1/mandates/nonexistent', { method: 'GET' }),
  );

  assert.equal(response.status, 404);
});

test('POST /v1/mandates/:id/revoke revokes a mandate', async () => {
  const repo = createMockRepo();
  const mandate = await repo.create({
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    scope: {},
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: futureDate,
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest(`http://localhost/v1/mandates/${mandate.id}/revoke`, { method: 'POST' }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'revoked');
});

test('POST /v1/mandates/:id/revoke returns 404 for unknown mandate', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository, mandateRepository: repo as unknown as MandateRepository });

  const response = await app(
    authenticatedRequest('http://localhost/v1/mandates/nonexistent/revoke', { method: 'POST' }),
  );

  assert.equal(response.status, 404);
});
