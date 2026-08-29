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
      headers: { authorization: 'Payment credential-that-must-not-be-persisted' },
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
    idempotencyKey: 'cb535c19-0629-442d-8eb3-c61b787c791b',
    requestFingerprint: 'e823cde9ef77ab25d59567a82d14a0c43ceb732f677b33dea216cdf3df052c2b',
    status: 'settled',
    amountMinor: 50,
    currency: 'usd',
    scale: 2,
    receipt: {
      method: 'stripe/charge',
      reference: 'payment-reference-1',
      externalId: 'charge-1',
      status: 'success',
      timestamp: '2026-08-29T00:00:00.000Z',
    },
  }]);
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

test('fails closed for an x402 offering without an x402 payment handler', async () => {
  const service = new PaymentService({ stripeProfileId: 'profile_test_example' });

  const response = await service.serve({
    ...endpoint,
    offering: {
      ...endpoint.offering,
      rail: 'stellar_x402',
      currency: 'usdc',
      scale: 7,
      networkId: 'stellar:testnet',
    },
  }, new Request('https://api.example/v1/products/market-signal/x402'));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'payment_rail_unavailable' });
});
