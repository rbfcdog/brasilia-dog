import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  purchaseIntentSchema,
  type AgentProof,
  type PurchaseIntent,
} from '../src/contracts.js';
import {
  DEMO_AGENT_ID,
  DEMO_MANDATE_ID,
  DemoBackend,
  createDemoOffers,
} from '../src/demo.js';
import { encodeAgentProof, sha256Utf8 } from '../src/crypto.js';

const fixedNow = new Date('2026-08-29T20:00:00.000Z');
const nowSeconds = Math.floor(fixedNow.getTime() / 1_000);

function buildIntent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  const offer = createDemoOffers()[0]!;
  const selectedOffer = {
    offerId: offer.offerId,
    merchantId: offer.merchantId,
    category: offer.category,
    destination: offer.destination,
    amountMinor: offer.amountMinor,
    currency: offer.currency,
  } as const;
  return purchaseIntentSchema.parse({
    schemaVersion: 'purchase-intent-v1',
    runId: randomUUID(),
    mandate: { id: DEMO_MANDATE_ID, version: 1 },
    offer: selectedOffer,
    agentClaim: {
      goal: 'Buy a flight to Córdoba below USD 150',
      selectedOffer,
      consideredOfferIds: [offer.offerId],
      rationale: 'This is the lowest-priced matching offer.',
      semanticEscalationRequested: false,
    },
    ...overrides,
  });
}

async function signBody(backend: DemoBackend, rawBody: string, overrides: Partial<AgentProof> = {}) {
  const proof = await backend.sign({
    bodySha256: sha256Utf8(rawBody),
    mandateId: DEMO_MANDATE_ID,
    mandateVersion: 1,
    method: 'POST',
    path: '/v1/purchase-attempts',
    nonce: randomBytes(18).toString('base64url'),
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + 60,
  });
  return { ...proof, ...overrides } as AgentProof;
}

test('a tampered proof signature is rejected', async () => {
  const backend = new DemoBackend({ now: () => fixedNow });
  const rawBody = JSON.stringify(buildIntent());
  const proof = await signBody(backend, rawBody);
  const first = proof.signature[0] === 'A' ? 'B' : 'A';
  const tampered = { ...proof, signature: `${first}${proof.signature.slice(1)}` };

  const result = await backend.presentPurchase({
    rawBody,
    encodedProof: encodeAgentProof(tampered),
    idempotencyKey: randomUUID(),
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.outcome === 'rejected' ? result.reasonCode : undefined, 'AGENT_PROOF_SIGNATURE_INVALID');
});

test('a proof from the wrong agent identity is rejected', async () => {
  const backend = new DemoBackend({ now: () => fixedNow });
  const rawBody = JSON.stringify(buildIntent());
  const proof = await signBody(backend, rawBody);
  assert.equal(proof.agentId, DEMO_AGENT_ID);
  backend.setMandate({ agentId: 'different-agent' });

  const result = await backend.presentPurchase({
    rawBody,
    encodedProof: encodeAgentProof(proof),
    idempotencyKey: randomUUID(),
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.outcome === 'rejected' ? result.reasonCode : undefined, 'AGENT_IDENTITY_INVALID');
});

test('reusing a valid proof nonce is rejected even with a new idempotency key', async () => {
  const backend = new DemoBackend({ now: () => fixedNow });
  const rawBody = JSON.stringify(buildIntent());
  const proof = await signBody(backend, rawBody);
  const presentation = { rawBody, encodedProof: encodeAgentProof(proof) };

  const first = await backend.presentPurchase({ ...presentation, idempotencyKey: randomUUID() });
  const replay = await backend.presentPurchase({ ...presentation, idempotencyKey: randomUUID() });
  assert.equal(first.outcome, 'allowed');
  assert.equal(replay.outcome, 'rejected');
  assert.equal(replay.outcome === 'rejected' ? replay.reasonCode : undefined, 'AGENT_PROOF_REPLAYED');
});

test('an expired proof is rejected', async () => {
  const backend = new DemoBackend({ now: () => fixedNow });
  const rawBody = JSON.stringify(buildIntent());
  const proof = await backend.sign({
    bodySha256: sha256Utf8(rawBody),
    mandateId: DEMO_MANDATE_ID,
    mandateVersion: 1,
    method: 'POST',
    path: '/v1/purchase-attempts',
    nonce: randomBytes(18).toString('base64url'),
    issuedAt: nowSeconds - 61,
    expiresAt: nowSeconds - 1,
  });

  const result = await backend.presentPurchase({
    rawBody,
    encodedProof: encodeAgentProof(proof),
    idempotencyKey: randomUUID(),
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.outcome === 'rejected' ? result.reasonCode : undefined, 'AGENT_PROOF_EXPIRED');
});

test('changing the signed UTF-8 body is detected by its SHA-256 binding', async () => {
  const backend = new DemoBackend({ now: () => fixedNow });
  const intent = buildIntent();
  const signedBody = JSON.stringify(intent);
  const proof = await signBody(backend, signedBody);
  const changedBody = JSON.stringify({
    ...intent,
    agentClaim: { ...intent.agentClaim, rationale: 'Changed after signing.' },
  });

  const result = await backend.presentPurchase({
    rawBody: changedBody,
    encodedProof: encodeAgentProof(proof),
    idempotencyKey: randomUUID(),
  });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.outcome === 'rejected' ? result.reasonCode : undefined, 'AGENT_PROOF_MISMATCH');
});
