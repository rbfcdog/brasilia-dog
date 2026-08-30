import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentService } from '../src/service.js';
import type { PersistentAgentIdentity } from '../src/agent-identity.js';
import type { MarketplaceAuthorityClient } from '../src/marketplace-authority-client.js';
import type { MarketplaceMandate, MarketplaceProduct, MarketplaceRunState } from '../src/marketplace-contracts.js';
import type { MarketplaceSelector } from '../src/marketplace-selector.js';
import type { ClaimedMarketplaceRun, DurableRunRepository } from '../src/durable-run-repository.js';
import { MarketplaceRunService } from '../src/marketplace-service.js';
import { AgentError } from '../src/errors.js';

const ids = {
  run: 'f187086c-b0b0-4606-b472-1e76544943f7',
  owner: '07ecae7c-22c8-408f-9ea7-687017f62312',
  mandate: 'f308fdc9-1ef9-44ab-9b8a-0d64f72007a4',
  identity: '2f0bd131-a339-4054-9c80-44bc9fedab69',
  key: '8fa4d652-724e-4497-846c-038825ac98dc',
  product: '5796fc76-4240-47db-9295-63315c14f21b',
  merchant: '6f119e8d-6d26-4347-adf6-ab73ffaf878e',
  offering: '84781e38-5347-42e0-981e-9ae8dc0ad8c6',
  endpoint: '72d75275-4a5f-439d-8b37-acad8dce94df',
};

function marketplaceMandate(overrides: Partial<MarketplaceMandate> = {}): MarketplaceMandate {
  return {
    id: ids.mandate, ownerId: ids.owner, agentIdentityId: ids.identity, version: 1,
    status: 'active', scope: { query: 'ultrawide monitor', category: 'electronics', constraints: [], searchWindowSeconds: 60 },
    maxAmountMinor: 30_000, currency: 'usd', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(), ...overrides,
  };
}

function marketplaceProduct(): MarketplaceProduct {
  return {
    id: ids.product, slug: 'aster-34', name: 'Aster 34', description: 'Ultrawide', status: 'published',
    metadata: { category: 'electronics' },
    merchant: { id: ids.merchant, businessName: 'Northstar', status: 'active' },
    offering: { id: ids.offering, rail: 'stripe_mpp', amountMinor: 29_243, currency: 'usd', scale: 2, networkId: 'profile-test', active: true },
    endpoint: { id: ids.endpoint, method: 'POST', path: '/v1/agent/products/aster-34/purchase', enabled: true },
  };
}

function claimed(status: ClaimedMarketplaceRun['status'] = 'queued'): ClaimedMarketplaceRun {
  return {
    id: ids.run, owner_id: ids.owner, mandate_id: ids.mandate, goal: 'Buy an ultrawide monitor',
    conversation_id: null, status, start_idempotency_key: crypto.randomUUID(), start_body_sha256: 'a'.repeat(64),
    next_poll_at: new Date().toISOString(), lease_owner: 'old-worker', lease_until: new Date(Date.now() - 1_000).toISOString(),
    state: { agentIdentityId: ids.identity, agentSigningKeyId: ids.key, candidates: [], authorityChecks: [] },
    result: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

interface Transition {
  status: ClaimedMarketplaceRun['status'];
  state: MarketplaceRunState;
  nextPollAt?: string | null;
  result?: Record<string, unknown> | null;
}

async function runWorker(options: {
  run?: ClaimedMarketplaceRun;
  mandate?: MarketplaceMandate;
  candidates?: MarketplaceProduct[];
  purchase?: () => Promise<{ proofId: string; receipt: Record<string, unknown>; paymentAttempt: Record<string, unknown> }>;
} = {}): Promise<{ transition: Transition; events: string[]; purchases: number; workerId: string }> {
  const run = options.run ?? claimed();
  const mandate = options.mandate ?? marketplaceMandate();
  const candidates = options.candidates ?? [];
  const events: string[] = [];
  let claimedOnce = false;
  let purchases = 0;
  let workerId = '';
  let resolveTransition!: (transition: Transition) => void;
  const transitioned = new Promise<Transition>((resolve) => { resolveTransition = resolve; });
  const repository = {
    async claim(receivedWorkerId: string) {
      workerId = receivedWorkerId;
      if (claimedOnce) return [];
      claimedOnce = true;
      return [run];
    },
    async appendEvent(_runId: string, type: string) { events.push(type); },
    async transition(_runId: string, transition: Transition) { resolveTransition(transition); },
  } as unknown as DurableRunRepository;
  const authority = {
    async candidates() { return { mandate, candidates }; },
    async purchase() {
      purchases += 1;
      if (options.purchase) return options.purchase();
      return {
        proofId: 'proof-real-1',
        receipt: { method: 'stripe', reference: 'receipt-real-1', status: 'settled' },
        paymentAttempt: { id: 'attempt-real-1', status: 'settled', amountMinor: 29_243, currency: 'usd' },
      };
    },
  } as unknown as MarketplaceAuthorityClient;
  const selector = {
    async select() { return { selected: candidates[0]!, rationale: 'Only authorized matching candidate.' }; },
  } as MarketplaceSelector;
  const service = new MarketplaceRunService({
    repository, authority, selector,
    identity: {} as PersistentAgentIdentity,
    legacy: {} as AgentService,
    workerId: 'worker-restarted',
  });
  service.startWorker();
  const transition = await Promise.race([
    transitioned,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('worker timeout')), 2_000)),
  ]);
  service.stopWorker();
  return { transition, events, purchases, workerId };
}

test('an empty authoritative search remains durable and polls again after three seconds', async () => {
  const before = Date.now();
  const result = await runWorker();
  assert.equal(result.transition.status, 'monitoring');
  assert.ok(Date.parse(result.transition.nextPollAt!) >= before + 2_900);
  assert.deepEqual(result.events, ['poll_started', 'candidates_scanned']);
  assert.equal(result.purchases, 0);
});

test('expiration requests extension of the same mandate without creating a replacement', async () => {
  const expiredAt = new Date(Date.now() - 1_000).toISOString();
  const result = await runWorker({ mandate: marketplaceMandate({ expiresAt: expiredAt }) });
  assert.equal(result.transition.status, 'waiting_for_extension');
  assert.deepEqual(result.transition.state.extensionRequest, {
    mandateId: ids.mandate, expiredAt, requestedAt: result.transition.state.extensionRequest?.requestedAt,
  });
  assert.ok(result.events.includes('extension_requested'));
});

test('revocation observed during polling always rejects before purchase', async () => {
  const result = await runWorker({ run: claimed('monitoring'), mandate: marketplaceMandate({ status: 'revoked' }), candidates: [marketplaceProduct()] });
  assert.equal(result.transition.status, 'rejected');
  assert.equal(result.transition.result?.reasonCode, 'MANDATE_REVOKED');
  assert.equal(result.purchases, 0);
});

test('a settled Stripe MPP result persists selected product, proof, attempt and receipt in one run state', async () => {
  const product = marketplaceProduct();
  const result = await runWorker({ candidates: [product] });
  assert.equal(result.transition.status, 'completed');
  assert.equal(result.transition.state.selectedProduct?.slug, product.slug);
  assert.equal(result.transition.state.proofId, 'proof-real-1');
  assert.equal(result.transition.state.paymentAttempt?.status, 'settled');
  assert.equal(result.transition.state.receipt?.reference, 'receipt-real-1');
  assert.equal(result.purchases, 1);
});

test('an ambiguous financial outcome becomes terminal and is not retried automatically', async () => {
  const result = await runWorker({
    candidates: [marketplaceProduct()],
    purchase: async () => { throw new AgentError('PAYMENT_OUTCOME_AMBIGUOUS', 'Do not retry.', 502); },
  });
  assert.equal(result.transition.status, 'failed');
  assert.equal(result.transition.result?.code, 'PAYMENT_OUTCOME_AMBIGUOUS');
  assert.equal(result.purchases, 1);
});

test('a restarted worker processes a previously running row after its lease is reclaimed', async () => {
  const result = await runWorker({ run: claimed('running') });
  assert.equal(result.workerId, 'worker-restarted');
  assert.equal(result.transition.status, 'monitoring');
});
