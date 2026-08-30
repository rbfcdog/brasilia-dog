import assert from 'node:assert/strict';
import test from 'node:test';

import type { PaymentAttemptRecord } from '../src/domain/types.js';
import {
  AgentRefundError,
  AgentRefundService,
  type PaymentHistoryForRefunds,
  type RefundProvider,
} from '../src/services/agent-refund-service.js';

function attempt(overrides: Partial<PaymentAttemptRecord> = {}): PaymentAttemptRecord {
  return {
    id: 'payment-latest',
    productId: 'product-1',
    offeringId: 'offering-1',
    endpointId: 'endpoint-1',
    rail: 'stripe_mpp',
    providerPaymentId: 'pi_owned_latest',
    idempotencyKey: 'purchase-key',
    status: 'settled',
    amountMinor: 9_500,
    currency: 'usd',
    scale: 2,
    requestFingerprint: null,
    receipt: { reference: 'receipt-1' },
    failureCode: null,
    agentExecutionProofId: 'proof-1',
    createdAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
}

test('agent refund selects the owner-scoped latest payment and calls Stripe idempotently', async () => {
  const stripeInputs: unknown[] = [];
  const updates: unknown[] = [];
  const payments: PaymentHistoryForRefunds = {
    async listPaymentAttempts(ownerId, limit) {
      assert.equal(ownerId, 'owner-1');
      assert.equal(limit, 50);
      return [attempt()];
    },
    async getPaymentAttempt() { return null; },
    async markRefunded(ownerId, paymentId, refundId) {
      updates.push({ ownerId, paymentId, refundId });
      return true;
    },
  };
  const provider: RefundProvider = {
    async refund(input) {
      stripeInputs.push(input);
      return {
        id: 're_owned_latest',
        amount: 9_500,
        currency: 'usd',
        status: 'succeeded',
        paymentIntentId: input.paymentIntentId,
        reason: input.reason ?? null,
      };
    },
  };

  const result = await new AgentRefundService(payments, provider).refund('owner-1', {
    selection: 'latest',
    paymentAttemptId: null,
    reason: 'requested_by_customer',
  });

  assert.deepEqual(stripeInputs, [{
    paymentIntentId: 'pi_owned_latest',
    reason: 'requested_by_customer',
    idempotencyKey: 'agent-refund:payment-latest',
  }]);
  assert.deepEqual(updates, [{ ownerId: 'owner-1', paymentId: 'payment-latest', refundId: 're_owned_latest' }]);
  assert.equal(result.paymentAttemptId, 'payment-latest');
  assert.equal(result.scale, 2);
});

test('retrying latest does not move to an older payment after the latest was refunded', async () => {
  let providerCalls = 0;
  const payments: PaymentHistoryForRefunds = {
    async listPaymentAttempts() {
      return [
        attempt({ id: 'payment-latest', status: 'refunded' }),
        attempt({ id: 'payment-older', providerPaymentId: 'pi_owned_older' }),
      ];
    },
    async getPaymentAttempt() { return null; },
    async markRefunded() { return true; },
  };
  const provider: RefundProvider = {
    async refund() {
      providerCalls += 1;
      throw new Error('must not be called');
    },
  };

  await assert.rejects(
    new AgentRefundService(payments, provider).refund('owner-1', {
      selection: 'latest', paymentAttemptId: null, reason: 'requested_by_customer',
    }),
    (error: unknown) => error instanceof AgentRefundError && error.code === 'PAYMENT_ALREADY_REFUNDED',
  );
  assert.equal(providerCalls, 0);
});

test('an explicit payment ID is still resolved through the authenticated owner scope', async () => {
  let requested: unknown;
  const payments: PaymentHistoryForRefunds = {
    async listPaymentAttempts() { return []; },
    async getPaymentAttempt(ownerId, paymentId) {
      requested = { ownerId, paymentId };
      return null;
    },
    async markRefunded() { return true; },
  };
  const provider: RefundProvider = {
    async refund() { throw new Error('must not be called'); },
  };

  await assert.rejects(
    new AgentRefundService(payments, provider).refund('owner-1', {
      selection: 'payment', paymentAttemptId: 'payment-not-owned', reason: 'requested_by_customer',
    }),
    (error: unknown) => error instanceof AgentRefundError && error.code === 'PAYMENT_NOT_FOUND',
  );
  assert.deepEqual(requested, { ownerId: 'owner-1', paymentId: 'payment-not-owned' });
});
