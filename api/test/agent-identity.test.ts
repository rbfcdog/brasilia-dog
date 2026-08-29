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
import type { MppHandler } from '../src/domain/types.js';
import type { AgentIdentityRepository } from '../src/repositories/agent-identity-repository.js';
import type { AgentIdentity, AgentSigningKey } from '../src/domain/types.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

class MockAgentIdentityRepository implements Pick<AgentIdentityRepository,
  'createIdentity' | 'getIdentity' | 'listIdentities' | 'updateStatus' | 'addSigningKey' | 'getActiveSigningKey' | 'getKeyByFingerprint'
> {
  private readonly identities = new Map<string, AgentIdentity>();
  private readonly keys = new Map<string, AgentSigningKey>();
  private counter = 0;

  async createIdentity(ownerId: string, displayName: string): Promise<AgentIdentity> {
    const id = `agent-${++this.counter}`;
    const identity: AgentIdentity = {
      id,
      ownerId,
      displayName,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.identities.set(id, identity);
    return identity;
  }

  async getIdentity(identityId: string): Promise<AgentIdentity | null> {
    return this.identities.get(identityId) ?? null;
  }

  async listIdentities(ownerId: string): Promise<AgentIdentity[]> {
    return [...this.identities.values()].filter((i) => i.ownerId === ownerId);
  }

  async updateStatus(identityId: string, status: 'active' | 'suspended' | 'revoked'): Promise<void> {
    const identity = this.identities.get(identityId);
    if (identity) {
      identity.status = status;
    }
  }

  async addSigningKey(
    agentIdentityId: string,
    publicKeyJwk: JsonWebKey,
    fingerprint: string,
    keyReference: string,
  ): Promise<AgentSigningKey> {
    const id = `key-${++this.counter}`;
    const key: AgentSigningKey = {
      id,
      agentIdentityId,
      algorithm: 'Ed25519',
      publicKeyJwk,
      publicKeyFingerprint: fingerprint,
      status: 'active',
      notBefore: new Date().toISOString(),
      notAfter: null,
    };
    this.keys.set(id, key);
    return key;
  }

  async getActiveSigningKey(agentIdentityId: string): Promise<AgentSigningKey | null> {
    for (const key of this.keys.values()) {
      if (key.agentIdentityId === agentIdentityId && key.status === 'active') {
        return key;
      }
    }
    return null;
  }

  async getKeyByFingerprint(fingerprint: string): Promise<AgentSigningKey | null> {
    for (const key of this.keys.values()) {
      if (key.publicKeyFingerprint === fingerprint && key.status === 'active') {
        return key;
      }
    }
    return null;
  }
}

function createMockRepo() {
  return new MockAgentIdentityRepository();
}

test('POST /v1/agents creates an agent identity with a signing key', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const jwk: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: 'dGVzdC1rZXk=' };
  const response = await app(
    authenticatedRequest('http://localhost/v1/agents', {
      method: 'POST',
      body: JSON.stringify({ ownerId: 'user-1', displayName: 'Test Agent', publicKeyJwk: jwk }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identity.displayName, 'Test Agent');
  assert.equal(body.identity.status, 'active');
  assert.ok(body.signingKey.id);
  assert.equal(body.signingKey.algorithm, 'Ed25519');
});

test('POST /v1/agents rejects a request with missing fields', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest('http://localhost/v1/agents', {
      method: 'POST',
      body: JSON.stringify({ ownerId: 'user-1' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /displayName and publicKeyJwk are required/);
});

test('GET /v1/agents lists identities by owner', async () => {
  const repo = createMockRepo();
  await repo.createIdentity('user-1', 'Agent A');
  await repo.createIdentity('user-1', 'Agent B');
  await repo.createIdentity('user-2', 'Agent C');

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest('http://localhost/v1/agents?ownerId=user-1', { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.agents.length, 2);
});

test('GET /v1/agents/:id returns a single identity', async () => {
  const repo = createMockRepo();
  const identity = await repo.createIdentity('user-1', 'Test Agent');

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest(`http://localhost/v1/agents/${identity.id}`, { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.agent.id, identity.id);
});

test('GET /v1/agents/:id returns 404 for unknown agent', async () => {
  const repo = createMockRepo();
  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest('http://localhost/v1/agents/nonexistent', { method: 'GET' }),
  );

  assert.equal(response.status, 404);
});

test('PATCH /v1/agents/:id/status updates status', async () => {
  const repo = createMockRepo();
  const identity = await repo.createIdentity('user-1', 'Test Agent');

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest(`http://localhost/v1/agents/${identity.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'suspended' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'suspended');
});

test('PATCH /v1/agents/:id/status rejects invalid status', async () => {
  const repo = createMockRepo();
  const identity = await repo.createIdentity('user-1', 'Test Agent');

  const app = createApp({ paidHandler, sessionService: testSessionService, agentIdentityRepository: repo as unknown as AgentIdentityRepository, });

  const response = await app(
    authenticatedRequest(`http://localhost/v1/agents/${identity.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 400);
});
