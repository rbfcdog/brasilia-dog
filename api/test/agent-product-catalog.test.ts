import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/http/app.js';
import type { MppHandler, ProductCatalogEntry } from '../src/domain/types.js';

const paidHandler: MppHandler = async () => new Response('paid');
const entry: ProductCatalogEntry = {
  id: 'product-1',
  slug: 'ultrawide-monitor-guide',
  name: 'Ultrawide monitor guide',
  description: 'A current MPP catalog product.',
  status: 'published',
  metadata: { category: 'electronics' },
  offering: {
    id: 'offering-1',
    rail: 'stripe_mpp',
    amountMinor: 250,
    currency: 'usd',
    scale: 2,
    networkId: 'profile_test_example',
    active: true,
  },
  endpoint: {
    id: 'endpoint-1',
    method: 'GET',
    path: '/v1/products/ultrawide-monitor-guide/mpp',
    enabled: true,
  },
};

test('agent service token can fetch the complete current product catalog', async () => {
  const app = createApp({
    paidHandler,
    agentServiceToken: 'agent-backend-token',
    productRepository: { listCatalog: async () => [entry], searchCatalog: async () => [entry] },
  });

  const response = await app(new Request('http://localhost/v1/agent/products', {
    headers: { authorization: 'Bearer agent-backend-token' },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { products: [entry] });
});

test('product catalog rejects callers without the agent service token', async () => {
  const app = createApp({
    paidHandler,
    agentServiceToken: 'agent-backend-token',
    productRepository: { listCatalog: async () => [entry], searchCatalog: async () => [entry] },
  });

  const response = await app(new Request('http://localhost/v1/agent/products'));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'agent_authentication_required' });
});

test('agent can run a bounded ranked marketplace query in the backend', async () => {
  const searches: unknown[] = [];
  const app = createApp({
    paidHandler,
    agentServiceToken: 'agent-backend-token',
    productRepository: {
      listCatalog: async () => [entry],
      searchCatalog: async (input) => {
        searches.push(input);
        return [entry];
      },
    },
  });

  const response = await app(new Request('http://localhost/v1/agent/products/search', {
    method: 'POST',
    headers: {
      authorization: 'Bearer agent-backend-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: 'monitor',
      category: 'electronics',
      maximumAmountMinor: 30_000,
      slugs: [],
      limit: 10,
    }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(searches, [{
    query: 'monitor',
    category: 'electronics',
    maximumAmountMinor: 30_000,
    slugs: [],
    limit: 10,
  }]);
  assert.deepEqual(await response.json(), { products: [entry] });
});
