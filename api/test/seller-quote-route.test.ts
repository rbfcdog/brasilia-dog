import assert from 'node:assert/strict';
import test from 'node:test';

import type { CrossCredentialAuth } from '../src/services/cross-credential-auth.js';
import type { PurchaseService } from '../src/services/purchase-service.js';
import type { SellerQuoteRepository } from '../src/repositories/seller-quote-repository.js';
import type { PasskeySession, SellerQuoteRequestRecord } from '../src/domain/types.js';

import { createApp } from '../src/http/app.js';
import { SellerAgentVerificationService } from '../src/services/seller-agent-verification.js';
import { InMemorySessionStore, SessionService } from '../src/services/session-service.js';

const secret = 'seller-quote-route-test-secret-that-is-at-least-32-bytes';

function agentProof() {
  return {
    agentId: 'agent-1',
    agentKeyId: 'key-1',
    bodySha256: 'a'.repeat(64),
    expiresAt: 1_800_000_000,
    issuedAt: 1_700_000_000,
    mandateId: 'mandate-1',
    mandateVersion: 1,
    method: 'POST',
    nonce: 'nonce-1',
    path: '/v1/seller/quote-requests',
    signature: 'signature',
  };
}

function quoteRecord(): SellerQuoteRequestRecord {
  return {
    id: 'quote-1',
    merchantId: 'merchant-1',
    ownerId: 'user-1',
    agentIdentityId: 'agent-1',
    mandateId: 'mandate-1',
    credentialCommitment: 'c'.repeat(64),
    agentVerificationHash: 'h'.repeat(64),
    priceLimitMinor: 22000,
    currency: 'usd',
    requirements: ['34-inch ultrawide monitor'],
    expiresAt: '2026-08-30T00:00:00.000Z',
    createdAt: '2026-08-29T00:00:00.000Z',
  };
}

async function setup() {
  const sessionService = new SessionService({ secret, store: new InMemorySessionStore() });
  const session = await sessionService.createSession('user-1', 'credential-1');
  const authorizations: unknown[] = [];
  const disclosures: unknown[] = [];
  const proofRecords: unknown[] = [];
  const quotes: Omit<SellerQuoteRequestRecord, 'id' | 'createdAt'>[] = [];
  const authorization = {
    session: session as PasskeySession,
    agent: { id: 'agent-1' },
    key: { id: 'key-1' },
    mandate: {
      id: 'mandate-1',
      version: 1,
      currency: 'usd',
      expiresAt: '2026-12-31T23:59:59.000Z',
    },
    proofId: { nonce: 'nonce-1' },
  };
  const crossCredentialAuth = {
    async authorize(input: unknown) {
      authorizations.push(input);
      return authorization;
    },
    checkSellerPriceDisclosure(...input: unknown[]) {
      disclosures.push(input);
    },
  } as unknown as CrossCredentialAuth;
  const purchaseService = {
    async recordProofForAuthorization(...input: unknown[]) {
      proofRecords.push(input);
      return 'proof-1';
    },
  } as unknown as PurchaseService;
  const sellerQuoteRepository = {
    async create(input: Omit<SellerQuoteRequestRecord, 'id' | 'createdAt'>) {
      quotes.push(input);
      return { ...quoteRecord(), ...input };
    },
    async getForSeller() { return null; },
  } as unknown as SellerQuoteRepository;
  const app = createApp({
    paidHandler: async () => new Response('paid'),
    crossCredentialAuth,
    purchaseService,
    sellerAgentVerificationService: new SellerAgentVerificationService(secret),
    sellerQuoteRepository,
    sessionService,
  });

  return { app, authorizations, disclosures, proofRecords, quotes, session };
}

test('POST seller quote request binds a passkey session and agent proof without returning credential material', async () => {
  const { app, authorizations, disclosures, proofRecords, quotes, session } = await setup();
  const response = await app(new Request('http://localhost/v1/seller/quote-requests', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      merchantId: 'merchant-1',
      intent: {
        priceLimitMinor: 22000,
        requirements: ['34-inch ultrawide monitor'],
      },
      agentProof: agentProof(),
    }),
  }));

  assert.equal(response.status, 201);
  const payload = await response.json() as { quoteRequest: Record<string, unknown> };
  assert.equal(payload.quoteRequest.merchantId, 'merchant-1');
  assert.equal('credentialCommitment' in payload.quoteRequest, false);
  assert.equal('agentVerificationHash' in payload.quoteRequest, false);
  assert.equal(authorizations.length, 1);
  assert.equal(disclosures.length, 1);
  assert.equal(proofRecords.length, 1);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0]?.ownerId, 'user-1');
  assert.equal(quotes[0]?.credentialCommitment.length, 64);
});

test('POST seller quote request requires an authenticated passkey session', async () => {
  const { app, authorizations, quotes } = await setup();
  const response = await app(new Request('http://localhost/v1/seller/quote-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      merchantId: 'merchant-1',
      intent: { priceLimitMinor: 22000, requirements: [] },
      agentProof: agentProof(),
    }),
  }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'authentication_required' });
  assert.equal(authorizations.length, 0);
  assert.equal(quotes.length, 0);
});
