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
import type { MppHandler, PaymentAttemptRecord, AgentActivityRecord } from '../src/domain/types.js';
import type { PaymentHistoryRepository } from '../src/repositories/payment-history-repository.js';
import type { AgentIdentityRepository } from '../src/repositories/agent-identity-repository.js';
import type { AgentIdentity } from '../src/domain/types.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

class MockPaymentHistoryRepository implements Pick<PaymentHistoryRepository,
  'listPaymentAttempts' | 'getPaymentAttempt' | 'listAgentActivity'
> {
  private readonly attempts = new Map<string, PaymentAttemptRecord>();
  private readonly activity = new Map<string, AgentActivityRecord[]>();

  addAttempt(record: PaymentAttemptRecord): void {
    this.attempts.set(record.id, record);
  }

  addActivity(agentId: string, record: AgentActivityRecord): void {
    const list = this.activity.get(agentId) ?? [];
    list.push(record);
    this.activity.set(agentId, list);
  }

  async listPaymentAttempts(): Promise<PaymentAttemptRecord[]> {
    return [...this.attempts.values()];
  }

  async getPaymentAttempt(_ownerId: string, id: string): Promise<PaymentAttemptRecord | null> {
    return this.attempts.get(id) ?? null;
  }

  async listAgentActivity(agentIdentityId: string): Promise<AgentActivityRecord[]> {
    return this.activity.get(agentIdentityId) ?? [];
  }

  async listPaymentAttemptsForAgent(agentIdentityId: string): Promise<PaymentAttemptRecord[]> {
    return [...this.attempts.values()].filter((a) => a.agentExecutionProofId === agentIdentityId);
  }
}

class MockAgentRepo implements Pick<AgentIdentityRepository, 'getIdentity'> {
  private readonly identities = new Map<string, AgentIdentity>();

  addIdentity(identity: AgentIdentity): void {
    this.identities.set(identity.id, identity);
  }

  async getIdentity(id: string): Promise<AgentIdentity | null> {
    return this.identities.get(id) ?? null;
  }
}

test('GET /v1/payments lists payment attempts', async () => {
  const repo = new MockPaymentHistoryRepository();
  repo.addAttempt({
    id: 'att-1',
    productId: 'prod-1',
    offeringId: 'off-1',
    endpointId: 'ep-1',
    rail: 'stripe_mpp',
    providerPaymentId: 'pi_123',
    idempotencyKey: 'key-1',
    status: 'settled',
    amountMinor: 50,
    currency: 'usd',
    scale: 2,
    requestFingerprint: null,
    receipt: { method: 'stripe' },
    failureCode: null,
    agentExecutionProofId: null,
    createdAt: new Date().toISOString(),
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, paymentHistoryRepository: repo as unknown as PaymentHistoryRepository, });

  const response = await app(authenticatedRequest('http://localhost/v1/payments'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.payments.length, 1);
  assert.equal(body.payments[0].id, 'att-1');
  assert.equal(body.payments[0].status, 'settled');
});

test('GET /v1/payments/:id returns a single payment attempt', async () => {
  const repo = new MockPaymentHistoryRepository();
  repo.addAttempt({
    id: 'att-1',
    productId: 'prod-1',
    offeringId: 'off-1',
    endpointId: 'ep-1',
    rail: 'stripe_mpp',
    providerPaymentId: 'pi_123',
    idempotencyKey: 'key-1',
    status: 'settled',
    amountMinor: 50,
    currency: 'usd',
    scale: 2,
    requestFingerprint: null,
    receipt: null,
    failureCode: null,
    agentExecutionProofId: null,
    createdAt: new Date().toISOString(),
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, paymentHistoryRepository: repo as unknown as PaymentHistoryRepository, });

  const response = await app(authenticatedRequest('http://localhost/v1/payments/att-1'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.payment.id, 'att-1');
});

test('GET /v1/payments/:id returns 404 for unknown payment', async () => {
  const repo = new MockPaymentHistoryRepository();
  const app = createApp({ paidHandler, sessionService: testSessionService, paymentHistoryRepository: repo as unknown as PaymentHistoryRepository, });

  const response = await app(authenticatedRequest('http://localhost/v1/payments/nonexistent'));

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, 'payment_not_found');
});

test('GET /v1/agents/:id/activity returns activity for an agent', async () => {
  const historyRepo = new MockPaymentHistoryRepository();
  const agentRepo = new MockAgentRepo();
  agentRepo.addIdentity({
    id: 'agent-1',
    ownerId: 'user-1',
    displayName: 'Test Agent',
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  historyRepo.addActivity('agent-1', {
    id: 'proof-1',
    agentIdentityId: 'agent-1',
    agentSigningKeyId: 'key-1',
    mandateId: 'mandate-1',
    mandateVersion: 1,
    requestMethod: 'POST',
    requestPath: '/v1/products/market-signal-sandbox/purchase',
    nonce: 'nonce-1',
    issuedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const app = createApp({ paidHandler, sessionService: testSessionService, paymentHistoryRepository: historyRepo as unknown as PaymentHistoryRepository,
  agentIdentityRepository: agentRepo as unknown as AgentIdentityRepository, });

  const response = await app(authenticatedRequest('http://localhost/v1/agents/agent-1/activity'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.activity.length, 1);
  assert.equal(body.activity[0].id, 'proof-1');
});

test('GET /v1/agents/:id/activity returns 404 for unknown agent', async () => {
  const historyRepo = new MockPaymentHistoryRepository();
  const agentRepo = new MockAgentRepo();

  const app = createApp({ paidHandler, sessionService: testSessionService, paymentHistoryRepository: historyRepo as unknown as PaymentHistoryRepository,
  agentIdentityRepository: agentRepo as unknown as AgentIdentityRepository, });

  const response = await app(authenticatedRequest('http://localhost/v1/agents/nonexistent/activity'));

  assert.equal(response.status, 404);
});
