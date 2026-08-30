import assert from 'node:assert/strict';
import test from 'node:test';

import { PaymentService } from '../src/services/payment-service.js';
import type { MppHandlerOptions, PaymentAttemptInput, ProductEndpoint } from '../src/domain/types.js';

const endpoint: ProductEndpoint = {
  id: 'endpoint-1',
  method: 'GET',
  path: '/v1/products/market-signal/mpp',
  responseStatus: 200,
  responseBody: { data: 'market signal' },
  product: {
    id: 'product-1',
    slug: 'market-signal',
    name: 'Market signal',
    description: 'A controlled market signal.',
  },
  offering: {
    id: 'offering-1',
    rail: 'stripe_mpp',
    amountMinor: 50,
    currency: 'usd',
    scale: 2,
    networkId: 'profile_test_example',
  },
};

test('uses an endpoint offering to create a Stripe MPP charge and records only receipt metadata', async () => {
  const created: MppHandlerOptions[] = [];
  const recorded: PaymentAttemptInput[] = [];
  const service = new PaymentService({
    stripeProfileId: 'profile_test_example',
    mppHandlerFactory(options) {
      created.push(options);
      return async () => new Response('paid catalog resource', { status: 200 });
    },
    paymentAttemptRepository: {
      async record(input) {
        recorded.push(input);
      },
    },
    randomUUID: () => 'cb535c19-0629-442d-8eb3-c61b787c791b',
  });

  const response = await service.serve(endpoint, new Request('https://api.example/v1/products/market-signal/mpp'));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'paid catalog resource');
  assert.equal(created.length, 1);
  const mppOptions = created[0];
  assert.ok(mppOptions);
  assert.equal(mppOptions.amount, '0.50');
  assert.equal(mppOptions.currency, 'usd');

  const onPaymentSuccess = mppOptions.onPaymentSuccess;
  assert.ok(onPaymentSuccess);
  await onPaymentSuccess({
    input: new Request('https://api.example/v1/products/market-signal/mpp', {
      headers: {
        authorization: 'Bearer passkey-session-that-must-not-be-persisted',
        'x-agent-execution-proof-id': 'proof-1',
      },
    }),
    receipt: {
      method: 'stripe/charge',
      reference: 'payment-reference-1',
      externalId: 'charge-1',
      status: 'success',
      timestamp: '2026-08-29T00:00:00.000Z',
    },
  });

  assert.deepEqual(recorded, [{
    productId: 'product-1',
    offeringId: 'offering-1',
    endpointId: 'endpoint-1',
    rail: 'stripe_mpp',
    providerPaymentId: 'charge-1',
    idempotencyKey: 'proof-1',
    requestFingerprint: 'e14b74ff1b094305b4fa3fc33b5dffdaf000fdab2155805c2462aed6048a05d4',
    status: 'settled',
    amountMinor: 50,
    currency: 'usd',
    scale: 2,
    agentExecutionProofId: 'proof-1',
    receipt: {
      method: 'stripe/charge',
      reference: 'payment-reference-1',
      externalId: 'charge-1',
      status: 'success',
      timestamp: '2026-08-29T00:00:00.000Z',
    },
  }]);
});

test('records a challenge and later settlement under the same agent-proof idempotency key', async () => {
  const recorded: PaymentAttemptInput[] = [];
  let paymentSuccess: MppHandlerOptions['onPaymentSuccess'];
  const service = new PaymentService({
    stripeProfileId: 'profile_test_example',
    mppHandlerFactory(options) {
      paymentSuccess = options.onPaymentSuccess;
      return async () => new Response('payment required', { status: 402 });
    },
    paymentAttemptRepository: { async record(input) { recorded.push(input); } },
  });
  const request = new Request('https://api.example/v1/products/market-signal/mpp', {
    headers: { 'x-agent-execution-proof-id': '11111111-1111-4111-8111-111111111111' },
  });

  const response = await service.serve(endpoint, request);
  assert.equal(response.status, 402);
  assert.equal(recorded[0]?.status, 'challenged');
  assert.equal(recorded[0]?.idempotencyKey, '11111111-1111-4111-8111-111111111111');

  assert.ok(paymentSuccess);
  await paymentSuccess({
    input: request,
    receipt: { method: 'stripe/charge', reference: 'receipt-1', status: 'success', timestamp: '2026-08-30T00:00:00Z' },
  });
  assert.equal(recorded[1]?.status, 'settled');
  assert.equal(recorded[1]?.idempotencyKey, recorded[0]?.idempotencyKey);
});

test('refuses an MPP offering that belongs to a different Stripe profile', async () => {
  const service = new PaymentService({
    stripeProfileId: 'profile_test_example',
    mppHandlerFactory() {
      throw new Error('must not create a charge');
    },
  });

  await assert.rejects(
    () => service.serve({
      ...endpoint,
      offering: { ...endpoint.offering, networkId: 'profile_test_other' },
    }, new Request('https://api.example/v1/products/market-signal/mpp')),
    /does not match the configured Stripe Profile/,
  );
});
