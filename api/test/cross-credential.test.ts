import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import assert from 'node:assert/strict';
import test from 'node:test';



import { createApp } from '../src/http/app.js';
import type { MppHandler, AgentIdentity, AgentSigningKey, Mandate, MandateScope } from '../src/domain/types.js';
import { SessionService, InMemorySessionStore } from '../src/services/session-service.js';
import { CrossCredentialAuth } from '../src/services/cross-credential-auth.js';
import type { AgentIdentityRepository } from '../src/repositories/agent-identity-repository.js';
import type { MandateRepository } from '../src/repositories/mandate-repository.js';
import type { ProductRepository } from '../src/repositories/product-repository.js';
import type { PaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';
import type { ProductEndpoint } from '../src/domain/types.js';
import { canonicalJson } from '../src/services/canonical-json.js';
import { canonicalAgentProofPayload } from '../src/services/agent-proof.js';
import type { AgentProofPayload } from '../src/services/agent-proof.js';
import { PurchaseService } from '../src/services/purchase-service.js';
const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });
const secret = 'a'.repeat(64);

function generateEd25519Key() {
  return generateKeyPairSync('ed25519');
}

class MockAgentRepo implements Pick<AgentIdentityRepository,
  'createIdentity' | 'getIdentity' | 'listIdentities' | 'updateStatus' | 'addSigningKey' | 'getActiveSigningKey' | 'getKeyByFingerprint'
> {
  private readonly identities = new Map<string, AgentIdentity>();
  private readonly keys = new Map<string, AgentSigningKey>();

  async createIdentity(ownerId: string, displayName: string): Promise<AgentIdentity> {
    const id = `agent-${this.identities.size + 1}`;
    const identity: AgentIdentity = { id, ownerId, displayName, status: 'active', createdAt: new Date().toISOString() };
    this.identities.set(id, identity);
    return identity;
  }

  async getIdentity(id: string): Promise<AgentIdentity | null> {
    return this.identities.get(id) ?? null;
  }

  async listIdentities(ownerId: string): Promise<AgentIdentity[]> {
    return [...this.identities.values()].filter((i) => i.ownerId === ownerId);
  }

  async updateStatus(id: string, status: 'active' | 'suspended' | 'revoked'): Promise<void> {
    const identity = this.identities.get(id);
    if (identity) { identity.status = status; }
  }

  async addSigningKey(agentIdentityId: string, publicKeyJwk: JsonWebKey, fingerprint: string, keyReference: string): Promise<AgentSigningKey> {
    const id = `key-${this.keys.size + 1}`;
    const key: AgentSigningKey = { id, agentIdentityId, algorithm: 'Ed25519', publicKeyJwk, publicKeyFingerprint: fingerprint, status: 'active', notBefore: new Date().toISOString(), notAfter: null };
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
      if (key.publicKeyFingerprint === fingerprint) { return key; }
    }
    return null;
  }
}

class MockMandateRepo implements Pick<MandateRepository,
  'create' | 'getMandate' | 'getActiveMandate' | 'listMandates' | 'revoke' | 'getUsage'
> {
  private readonly mandates = new Map<string, Mandate>();
  private counter = 0;

  async create(params: { ownerId: string; agentIdentityId: string; scope: MandateScope; maxAmountMinor: number; currency: string; expiresAt: string }): Promise<Mandate> {
    const id = `mandate-${++this.counter}`;
    const mandate: Mandate = { id, ownerId: params.ownerId, agentIdentityId: params.agentIdentityId, version: 1, status: 'active', scope: params.scope, maxAmountMinor: params.maxAmountMinor, currency: params.currency, expiresAt: params.expiresAt, createdAt: new Date().toISOString() };
    this.mandates.set(id, mandate);
    return mandate;
  }

  async getMandate(id: string): Promise<Mandate | null> {
    return this.mandates.get(id) ?? null;
  }

  async getActiveMandate(agentIdentityId: string): Promise<Mandate | null> {
    for (const m of this.mandates.values()) {
      if (m.agentIdentityId === agentIdentityId && m.status === 'active' && new Date(m.expiresAt).getTime() > Date.now()) {
        return m;
      }
    }
    return null;
  }

  async listMandates(ownerId: string): Promise<Mandate[]> {
    return [...this.mandates.values()].filter((m) => m.ownerId === ownerId);
  }

  async revoke(id: string): Promise<void> {
    const m = this.mandates.get(id);
    if (m) { m.status = 'revoked'; }
  }

  async getUsage(): Promise<{ totalSpentMinor: number; purchaseCount: number }> {
    return { totalSpentMinor: 0, purchaseCount: 0 };
  }
}

class MockProductRepo implements Pick<ProductRepository, 'findEnabledEndpoint'> {
  async findEnabledEndpoint(method: string, path: string): Promise<ProductEndpoint | null> {
    if (method === 'GET' && path === '/v1/products/market-signal-sandbox/mpp') {
      return {
        id: 'endpoint-1',
        method: 'GET',
        path,
        responseStatus: 200,
        responseBody: { data: 'test-resource' },
        offering: { id: 'offering-1', rail: 'stripe_mpp', amountMinor: 50, currency: 'usd', scale: 2, networkId: 'profile_test_example' },
        product: { id: 'product-1', slug: 'market-signal-sandbox', name: 'Market Signal Sandbox', description: 'Test product' },
      };
    }
    return null;
  }
}

class MockPaymentAttemptRepo implements Pick<PaymentAttemptRepository, 'record'> {
  async record(): Promise<unknown> {
    return { id: 'attempt-1' };
  }
}

async function setupAgentAndMandate(
  agentRepo: MockAgentRepo,
  mandateRepo: MockMandateRepo,
  ownerId = 'user-1',
) {
  const { publicKey, privateKey } = generateEd25519Key();
  const jwk = publicKey.export({ format: 'jwk' });
  const fingerprint = createHash('sha256').update(JSON.stringify(jwk)).digest('hex');

  const identity = await agentRepo.createIdentity(ownerId, 'Test Agent');
  const key = await agentRepo.addSigningKey(identity.id, jwk, fingerprint, `ref-${identity.id}`);

  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const mandate = await mandateRepo.create({
    ownerId,
    agentIdentityId: identity.id,
    scope: { allowedProductSlugs: ['market-signal-sandbox'] },
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: futureDate,
  });

  return { identity, key, mandate, privateKey, jwk };
}

function signProof(privateKey: KeyObject, payload: AgentProofPayload): string {
  const canonical = canonicalAgentProofPayload(payload);
  return cryptoSign(null, Buffer.from(canonical), privateKey).toString('base64url');
}
test('cross-credential auth succeeds with valid session and agent proof', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const { identity, key, mandate, privateKey } = await setupAgentAndMandate(agentRepo, mandateRepo);

  const session = await sessionService.createSession('user-1', 'cred-1');

  const body = JSON.stringify({ sessionToken: session.token });
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('base64url');

  const proofPayload = {
    agentId: identity.id,
    agentKeyId: key.id,
    bodySha256,
    expiresAt: now + 300,
    issuedAt: now,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    method: 'POST',
    nonce,
    path: '/v1/products/market-signal-sandbox/purchase',
  };

  const signature = signProof(privateKey, proofPayload);

  const result = await auth.authorize({
    sessionToken: session.token,
    agentProof: { ...proofPayload, signature },
    method: 'POST',
    path: '/v1/products/market-signal-sandbox/purchase',
    body,
  });

  assert.equal(result.agent.id, identity.id);
  assert.equal(result.mandate.id, mandate.id);
  assert.equal(result.session.userId, 'user-1');
});

test('cross-credential auth fails with invalid session token', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  await setupAgentAndMandate(agentRepo, mandateRepo);

  await assert.rejects(
    () => auth.authorize({
      sessionToken: 'invalid.token',
      agentProof: {} as never,
      method: 'POST',
      path: '/test',
      body: '',
    }),
    /Invalid or expired passkey session/,
  );
});

test('cross-credential auth fails when session user does not own agent', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  // Create agent owned by user-1
  const { identity, key, mandate, privateKey } = await setupAgentAndMandate(agentRepo, mandateRepo, 'user-1');

  // Create session for user-2 (different user)
  const session = await sessionService.createSession('user-2', 'cred-2');

  const body = JSON.stringify({ sessionToken: session.token });
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('base64url');

  const proofPayload = {
    agentId: identity.id,
    agentKeyId: key.id,
    bodySha256,
    expiresAt: now + 300,
    issuedAt: now,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    method: 'POST',
    nonce,
    path: '/v1/products/market-signal-sandbox/purchase',
  };

  const signature = signProof(privateKey, proofPayload);

  await assert.rejects(
    () => auth.authorize({
      sessionToken: session.token,
      agentProof: { ...proofPayload, signature },
      method: 'POST',
      path: '/v1/products/market-signal-sandbox/purchase',
      body,
    }),
    /does not own this agent/,
  );
});

test('cross-credential auth fails with tampered proof signature', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const { identity, key, mandate } = await setupAgentAndMandate(agentRepo, mandateRepo);
  const session = await sessionService.createSession('user-1', 'cred-1');

  const body = JSON.stringify({ sessionToken: session.token });
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('base64url');

  const proofPayload = {
    agentId: identity.id,
    agentKeyId: key.id,
    bodySha256,
    expiresAt: now + 300,
    issuedAt: now,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    method: 'POST',
    nonce,
    path: '/v1/products/market-signal-sandbox/purchase',
  };

  // Use a fake signature
  const fakeSignature = randomBytes(64).toString('base64url');

  await assert.rejects(
    () => auth.authorize({
      sessionToken: session.token,
      agentProof: { ...proofPayload, signature: fakeSignature },
      method: 'POST',
      path: '/v1/products/market-signal-sandbox/purchase',
      body,
    }),
    /signature is invalid/,
  );
});

test('checkScope rejects product not in allowed list', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const mandate: Mandate = {
    id: 'm1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    version: 1,
    status: 'active',
    scope: { allowedProductSlugs: ['product-a'] },
    maxAmountMinor: 1000,
    currency: 'usd',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  assert.throws(
    () => auth.checkScope(mandate, 'product-b', 50),
    /Product is not allowed by the mandate scope/,
  );
});

test('checkScope rejects amount exceeding mandate maximum', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const mandate: Mandate = {
    id: 'm1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    version: 1,
    status: 'active',
    scope: { allowedProductSlugs: ['product-a'] },
    maxAmountMinor: 100,
    currency: 'usd',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  assert.throws(
    () => auth.checkScope(mandate, 'product-a', 200),
    /exceeds the mandate maximum/,
  );
});

test('checkScope passes for allowed product within limit', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const mandate: Mandate = {
    id: 'm1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    version: 1,
    status: 'active',
    scope: { allowedProductSlugs: ['product-a'] },
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  auth.checkScope(mandate, 'product-a', 50);
  // No throw means pass
  assert.ok(true);
});

test('checkSellerPriceDisclosure requires an authorized seller and bounded price', () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const auth = new CrossCredentialAuth(
    sessionService,
    new MockAgentRepo() as unknown as AgentIdentityRepository,
    new MockMandateRepo() as unknown as MandateRepository,
  );
  const mandate: Mandate = {
    id: 'm1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    version: 1,
    status: 'active',
    scope: {
      sellerPriceDisclosure: {
        merchantIds: ['merchant-1'],
        maxPriceMinor: 500,
        requirements: ['size: 34-inch'],
      },
    },
    maxAmountMinor: 500,
    currency: 'usd',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  auth.checkSellerPriceDisclosure(mandate, 'merchant-1', 500, ['size: 34-inch']);
  assert.throws(
    () => auth.checkSellerPriceDisclosure(mandate, 'merchant-2', 500, []),
    /does not authorize price disclosure/,
  );
  assert.throws(
    () => auth.checkSellerPriceDisclosure(mandate, 'merchant-1', 501, []),
    /exceeds the authorized mandate limit/,
  );
  assert.throws(
    () => auth.checkSellerPriceDisclosure(mandate, 'merchant-1', 500, ['unapproved requirement']),
    /not authorized by the mandate scope/,
  );
});

test('POST /v1/products/:slug/purchase returns 401 without sessionToken', async () => {
  const sessionStore = new InMemorySessionStore();
  const sessionService = new SessionService({ secret, store: sessionStore });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const productRepo = new MockProductRepo();
  const auth = new CrossCredentialAuth(sessionService, agentRepo as unknown as AgentIdentityRepository, mandateRepo as unknown as MandateRepository);

  const purchaseService = new PurchaseService({
    crossCredentialAuth: auth,
    productRepository: productRepo as unknown as ProductRepository,
    recordProof: async () => 'proof-1',
  });

  const app = createApp({ paidHandler, purchaseService });

  const response = await app(
    new Request('http://localhost/v1/products/market-signal-sandbox/purchase', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 401);
});

test('POST /v1/products/:slug/purchase returns the MPP payment challenge after both credentials pass', async () => {
  const sessionService = new SessionService({ secret, store: new InMemorySessionStore() });
  const agentRepo = new MockAgentRepo();
  const mandateRepo = new MockMandateRepo();
  const productRepo = new MockProductRepo();
  const crossCredentialAuth = new CrossCredentialAuth(
    sessionService,
    agentRepo as unknown as AgentIdentityRepository,
    mandateRepo as unknown as MandateRepository,
  );
  const { identity, key, mandate, privateKey } = await setupAgentAndMandate(agentRepo, mandateRepo);
  const session = await sessionService.createSession('user-1', 'credential-1');
  const intent = { purpose: 'buy a market signal' };
  const canonicalIntent = canonicalJson(intent);
  const now = Math.floor(Date.now() / 1000);
  const proofPayload = {
    agentId: identity.id,
    agentKeyId: key.id,
    bodySha256: createHash('sha256').update(canonicalIntent).digest('hex'),
    expiresAt: now + 120,
    issuedAt: now,
    mandateId: mandate.id,
    mandateVersion: mandate.version,
    method: 'POST',
    nonce: randomBytes(16).toString('base64url'),
    path: '/v1/products/market-signal-sandbox/purchase',
  };
  const agentProof = { ...proofPayload, signature: signProof(privateKey, proofPayload) };
  const purchaseService = new PurchaseService({
    crossCredentialAuth,
    productRepository: productRepo as unknown as ProductRepository,
    recordProof: async () => 'proof-1',
  });
  const paymentService = {
    serve: async () => new Response(null, { status: 402 }),
  };
  const app = createApp({
    paidHandler,
    purchaseService,
    paymentService,
    sessionService,
  });

  const response = await app(new Request('http://localhost/v1/products/market-signal-sandbox/purchase', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ intent, agentProof }),
  }));

  assert.equal(response.status, 402);
  assert.equal(response.headers.get('x-agent-execution-proof-id'), 'proof-1');
});
