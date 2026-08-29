import assert from 'node:assert/strict';
import test from 'node:test';

import { ProductCatalogService } from '../src/services/product-catalog-service.js';
import type { ProductEndpoint } from '../src/domain/types.js';

const resolvedEndpoint: ProductEndpoint = {
  id: 'endpoint-1',
  method: 'GET',
  path: '/v1/products/signal/mpp',
  responseStatus: 200,
  responseBody: { data: 'signal' },
  product: {
    id: 'product-1',
    slug: 'signal',
    name: 'Signal',
    description: 'A controlled signal.',
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

test('resolves a product endpoint by request method and pathname', async () => {
  const calls: Array<{ method: string; path: string }> = [];
  const service = new ProductCatalogService({
    async findEnabledEndpoint(method, path) {
      calls.push({ method, path });
      return resolvedEndpoint;
    },
  });

  const endpoint = await service.resolve(new Request('https://api.example/v1/products/signal/mpp?ignored=yes'));

  assert.deepEqual(endpoint, resolvedEndpoint);
  assert.deepEqual(calls, [{ method: 'GET', path: '/v1/products/signal/mpp' }]);
});

test('does not query an endpoint outside the product API prefix', async () => {
  const service = new ProductCatalogService({
    async findEnabledEndpoint() {
      throw new Error('must not query');
    },
  });

  assert.equal(await service.resolve(new Request('https://api.example/health')), null);
});

