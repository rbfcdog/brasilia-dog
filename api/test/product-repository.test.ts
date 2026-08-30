import assert from 'node:assert/strict';
import test from 'node:test';

import { ProductRepository } from '../src/repositories/product-repository.js';
import type { SupabaseClient } from '@supabase/supabase-js';

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const endpointRow = {
  id: 'endpoint-1',
  method: 'GET',
  path: '/v1/products/market-signal/mpp',
  response_status: 200,
  response_body: { data: 'market signal' },
  offering: {
    id: 'offering-1',
    rail: 'stripe_mpp',
    amount_minor: 50,
    currency: 'usd',
    scale: 2,
    network_id: 'profile_test_123',
    product: {
      id: 'product-1',
      slug: 'market-signal',
      name: 'Market signal',
      description: 'A controlled market signal.',
      metadata: {},
    },
  },
};

function createEndpointClient(result: QueryResult, calls: unknown[][]) {
  const query = {
    select(value: string) {
      calls.push(['select', value]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(['eq', column, value]);
      return query;
    },
    async maybeSingle() {
      return result;
    },
  };

  return {
    from(table: string) {
      calls.push(['from', table]);
      return query;
    },
  };
}

test('loads an enabled product endpoint with its offering and product', async () => {
  const calls: unknown[][] = [];
  const repository = new ProductRepository(createEndpointClient({ data: endpointRow, error: null }, calls) as unknown as SupabaseClient);

  const endpoint = await repository.findEnabledEndpoint('GET', '/v1/products/market-signal/mpp');

  assert.deepEqual(endpoint, {
    id: 'endpoint-1',
    method: 'GET',
    path: '/v1/products/market-signal/mpp',
    responseStatus: 200,
    responseBody: { data: 'market signal' },
    offering: {
      id: 'offering-1',
      rail: 'stripe_mpp',
      amountMinor: 50,
      currency: 'usd',
      scale: 2,
      networkId: 'profile_test_123',
    },
    product: {
      id: 'product-1',
      slug: 'market-signal',
      name: 'Market signal',
      description: 'A controlled market signal.',
      metadata: {},
    },
  });
  assert.deepEqual(calls.slice(0, 5), [
    ['from', 'product_endpoints'],
    ['select', 'id,method,path,response_status,response_body,offering:product_payment_offerings!inner(id,rail,amount_minor,currency,scale,network_id,product:products!inner(id,slug,name,description,status,metadata,owner_id))'],
    ['eq', 'method', 'GET'],
    ['eq', 'path', '/v1/products/market-signal/mpp'],
    ['eq', 'offering.rail', 'stripe_mpp'],
  ]);
});

test('returns null when no enabled product endpoint matches', async () => {
  const repository = new ProductRepository(createEndpointClient({ data: null, error: null }, []) as unknown as SupabaseClient);

  assert.equal(await repository.findEnabledEndpoint('GET', '/missing'), null);
});

test('throws a repository error without leaking query details', async () => {
  const repository = new ProductRepository(createEndpointClient({ data: null, error: { message: 'database unavailable' } }, []) as unknown as SupabaseClient);

  await assert.rejects(
    () => repository.findEnabledEndpoint('GET', '/missing'),
    /Could not load a product endpoint/,
  );
});
