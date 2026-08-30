import assert from 'node:assert/strict';
import test from 'node:test';

import { SandboxProductRepository } from '../src/repositories/sandbox-product-repository.js';

test('sandbox catalog lists demonstrable products without database access', async () => {
  const repository = new SandboxProductRepository('profile_test_demo');

  const products = await repository.listCatalog();

  assert.equal(products.length, 6);
  assert.equal(products.every((product) => product.status === 'published'), true);
  assert.equal(products.every((product) => product.offering.networkId === 'profile_test_demo'), true);
});

test('sandbox catalog applies bounded search filters', async () => {
  const repository = new SandboxProductRepository('profile_test_demo');

  const products = await repository.searchCatalog({
    query: 'monitor ultrawide',
    category: 'electronics',
    maximumAmountMinor: 300,
    slugs: [],
    limit: 3,
  });

  assert.deepEqual(products.map((product) => product.slug), ['ultrawide-monitor-buying-guide']);
});
