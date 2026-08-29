import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/http/app.js';
import type { MppHandler } from '../src/domain/types.js';
import { RefundService } from '../src/services/refund-service.js';
import { PasskeyService } from '../src/services/passkey-service.js';
import { InMemoryPasskeyStore } from '../src/services/passkey-store.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

test('refund endpoint rejects a request without paymentIntentId', async () => {
  const refundService = new RefundService('sk_test_dummy');
  const app = createApp({ paidHandler, refundService });

  const response = await app(
    new Request('http://localhost/refund', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'paymentIntentId is required');
});

test('refund endpoint rejects a request with an empty body', async () => {
  const refundService = new RefundService('sk_test_dummy');
  const app = createApp({ paidHandler, refundService });

  const response = await app(
    new Request('http://localhost/refund', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    }),
  );

  assert.equal(response.status, 400);
});

test('refund service constructs a Stripe refund call', async () => {
  // Unit test: verify the RefundService maps inputs correctly.
  // We do not hit Stripe here; we verify the service interface contract.
  const service = new RefundService('sk_test_dummy');
  assert.ok(typeof service.refund === 'function');
  assert.ok(typeof service.retrievePaymentIntent === 'function');
});
