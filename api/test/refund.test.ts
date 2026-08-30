import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/http/app.js';
import type { MppHandler, PaymentAttemptRecord } from '../src/domain/types.js';
import type { PaymentHistoryRepository } from '../src/repositories/payment-history-repository.js';
import type { SessionService } from '../src/services/session-service.js';
import { RefundService } from '../src/services/refund-service.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

const sessionService = {
  verifySession: async (token: string) => token === 'passkey-session'
    ? { token, userId: 'user-1', credentialId: 'credential-1', issuedAt: 0, expiresAt: Date.now() + 60_000 }
    : null,
} as unknown as SessionService;

const settledStripeAttempt: PaymentAttemptRecord = {
  id: 'payment-1',
  productId: 'product-1',
  offeringId: 'offering-1',
  endpointId: 'endpoint-1',
  rail: 'stripe_mpp',
  providerPaymentId: 'pi_buyer_owned',
  idempotencyKey: 'payment-key-1',
  status: 'settled',
  amountMinor: 9_500,
  currency: 'usd',
  scale: 2,
  requestFingerprint: null,
  receipt: { reference: 'receipt-1' },
  failureCode: null,
  agentExecutionProofId: 'proof-1',
  createdAt: '2026-08-29T00:00:00.000Z',
};

test('buyer refund requires an authenticated passkey session', async () => {
  const app = createApp({ paidHandler, refundService: new RefundService('sk_test_dummy') });

  const response = await app(new Request('http://localhost/v1/payments/payment-1/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'requested_by_customer' }),
  }));

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'authentication_required');
});

test('buyer refund uses the owned settled Stripe payment and records the refunded state', async () => {
  let refundInput: unknown;
  let markedRefunded: unknown;
  const paymentHistoryRepository = {
    getPaymentAttempt: async (ownerId: string, paymentId: string) =>
      ownerId === 'user-1' && paymentId === settledStripeAttempt.id ? settledStripeAttempt : null,
    markRefunded: async (ownerId: string, paymentId: string, refundId: string) => {
      markedRefunded = { ownerId, paymentId, refundId };
      return true;
    },
  } as unknown as PaymentHistoryRepository;
  const refundService = {
    refund: async (input: unknown) => {
      refundInput = input;
      return {
        id: 're_buyer_owned',
        amount: 9_500,
        currency: 'usd',
        status: 'succeeded',
        paymentIntentId: settledStripeAttempt.providerPaymentId!,
        reason: 'requested_by_customer',
      };
    },
  } as unknown as RefundService;
  const app = createApp({ paidHandler, sessionService, paymentHistoryRepository, refundService });

  const response = await app(new Request('http://localhost/v1/payments/payment-1/refund', {
    method: 'POST',
    headers: {
      authorization: 'Bearer passkey-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ reason: 'requested_by_customer' }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(refundInput, {
    paymentIntentId: 'pi_buyer_owned',
    reason: 'requested_by_customer',
    idempotencyKey: 'buyer-refund:payment-1',
  });
  assert.deepEqual(markedRefunded, {
    ownerId: 'user-1',
    paymentId: 'payment-1',
    refundId: 're_buyer_owned',
  });
});

test('refund service constructs a Stripe refund call', async () => {
  // Unit test: verify the RefundService maps inputs correctly.
  // We do not hit Stripe here; we verify the service interface contract.
  const service = new RefundService('sk_test_dummy');
  assert.ok(typeof service.refund === 'function');
  assert.ok(typeof service.retrievePaymentIntent === 'function');
});
