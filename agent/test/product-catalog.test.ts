import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { HttpBackendAdapter } from '../src/adapters.js';

const backendToken = 'backend-product-token-12345';

const products = [{
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
}];

test('HTTP backend adapter fetches and validates all current products', async (t) => {
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/v1/agent/products');
    assert.equal(request.headers.authorization, `Bearer ${backendToken}`);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ products }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');

  const adapter = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });

  assert.deepEqual(await adapter.listProducts(), products);
});
