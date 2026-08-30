import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/http/app.js';
import type { ProductEndpoint } from '../src/domain/types.js';

test('reports service health without touching the payment handler', async () => {
  const app = createApp({
    paidHandler: async () => {
      throw new Error('paid handler must not run for health checks');
    },
  });

  const response = await app(new Request('http://localhost/health'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('passes the controlled paid resource to the MPP handler', async () => {
  const seen: string[] = [];
  const app = createApp({
    paidHandler: async (request) => {
      seen.push(request.url);
      return new Response('paid resource', { status: 200 });
    },
  });

  const response = await app(new Request('http://localhost/paid'));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'paid resource');
  assert.deepEqual(seen, ['http://localhost/paid']);
});

test('routes an enabled catalog endpoint through its selected payment rail', async () => {
  const resolved: string[] = [];
  const served: [ProductEndpoint, string][] = [];
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
  const app = createApp({
    paidHandler: async () => new Response('unexpected'),
    productCatalogService: {
      async resolve(request) {
        resolved.push(request.url);
        return endpoint;
      },
    },
    paymentService: {
      async serve(resolvedEndpoint, request) {
        served.push([resolvedEndpoint, request.url]);
        return new Response('catalog resource', { status: 200 });
      },
    },
  });

  const response = await app(new Request('http://localhost/v1/products/market-signal/mpp'));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'catalog resource');
  assert.deepEqual(resolved, ['http://localhost/v1/products/market-signal/mpp']);
  assert.deepEqual(served, [[endpoint, 'http://localhost/v1/products/market-signal/mpp']]);
});

test('does not route catalog endpoints when product storage is unconfigured', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unexpected'),
  });

  const response = await app(new Request('http://localhost/v1/products/market-signal/mpp'));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});

test('rejects routes outside the controlled paid resource', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unexpected'),
  });

  const response = await app(new Request('http://localhost/unknown'));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});

test('serves an OpenAPI discovery document with payment info at /openapi.json', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unexpected'),
  });

  const response = await app(new Request('http://localhost/openapi.json'));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');

  const body = await response.json();
  assert.equal(body.openapi, '3.1.0');
  assert.ok(body.paths['/paid']);
  assert.ok(body.paths['/paid'].get['x-payment-info']);
  assert.equal(body.paths['/paid'].get['x-payment-info'].amount, '50');
  assert.equal(body.paths['/paid'].get['x-payment-info'].currency, 'usd');
  assert.ok(body.paths['/v1/seller/quote-requests']);
  assert.ok(body.paths['/v1/seller/quote-requests/{id}']);
  assert.ok(body.paths['/v1/seller/quote-requests/{id}/verify']);
});
