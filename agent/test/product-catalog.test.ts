import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { HttpBackendAdapter } from '../src/adapters.js';
import { DemoBackend } from '../src/demo.js';

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

test('HTTP backend adapter turns a missing catalog route into a retryable catalog-unavailable error', async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');
  const adapter = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });

  await assert.rejects(
    adapter.listProducts(),
    (error: unknown) => (
      error instanceof Error
      && "code" in error
      && error.code === "PRODUCT_CATALOG_UNAVAILABLE"
      && "httpStatus" in error
      && error.httpStatus === 503
    ),
  );
});

test('HTTP backend adapter keeps catalog payment challenges and server failures out of the buyer flow', async (t) => {
  const statuses = [402, 500];
  const server = createServer((_request, response) => {
    const status = statuses.shift() ?? 500;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: `status_${status}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');
  const adapter = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });

  for (const expectedStatus of [402, 500]) {
    await assert.rejects(
      adapter.listProducts(),
      (error: unknown) => (
        error instanceof Error
        && "code" in error
        && error.code === "PRODUCT_CATALOG_UNAVAILABLE"
        && "httpStatus" in error
        && error.httpStatus === 503
      ),
      `HTTP ${expectedStatus} should be normalized to a retryable catalog error`,
    );
  }
});

test('HTTP backend adapter delegates bounded marketplace search to the API', async (t) => {
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/agent/products/search');
    assert.equal(request.headers.authorization, `Bearer ${backendToken}`);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString('utf8'));
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
  const input = {
    query: 'monitor',
    category: 'electronics',
    maximumAmountMinor: 30_000,
    slugs: [],
    limit: 10,
  };

  assert.deepEqual(await adapter.searchProducts(input), products);
  assert.deepEqual(requests.map((body) => JSON.parse(body)), [input]);
});

test('HTTP backend adapter accepts a legacy search result without lifecycle fields', async (t) => {
  const legacyProduct = {
    id: 'product-1',
    slug: 'ultrawide-monitor-guide',
    name: 'Ultrawide monitor guide',
    description: 'A current MPP catalog product.',
    offering: {
      id: 'offering-1',
      rail: 'stripe_mpp',
      amountMinor: 250,
      currency: 'usd',
      scale: 2,
    },
    endpoint: {
      id: 'endpoint-1',
      method: 'GET',
      path: '/v1/products/ultrawide-monitor-guide/mpp',
    },
  };
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ products: [legacyProduct] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');

  const adapter = new HttpBackendAdapter({
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: backendToken,
  });
  const result = await adapter.searchProducts({
    query: 'monitor', category: 'electronics', maximumAmountMinor: 30_000, slugs: [], limit: 10,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.slug, "ultrawide-monitor-guide");
  assert.equal(result[0]?.status, "published");
  assert.deepEqual(result[0]?.metadata, {});
  assert.equal(result[0]?.offering.networkId, null);
  assert.equal(result[0]?.offering.active, true);
  assert.equal(result[0]?.endpoint.enabled, true);
});

test('demo backend provides a self-contained filtered product catalog', async () => {
  const backend = new DemoBackend();

  const products = await backend.searchProducts({
    query: 'fones de ouvido',
    category: 'electronics',
    maximumAmountMinor: 250,
    slugs: [],
    limit: 10,
  });

  assert.deepEqual(products.map((product) => product.slug), [
    'noise-cancelling-headphone-index',
  ]);
  assert.ok((await backend.listProducts()).length > products.length);

  const pluralProducts = await backend.searchProducts({
    query: 'headphones',
    category: 'electronics',
    maximumAmountMinor: null,
    slugs: [],
    limit: 10,
  });
  assert.deepEqual(pluralProducts.map((product) => product.slug), [
    'noise-cancelling-headphone-index',
  ]);
});
