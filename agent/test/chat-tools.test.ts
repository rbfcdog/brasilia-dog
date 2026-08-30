import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';

import type { CatalogProduct } from '../src/adapters.js';
import { OpenAIShoppingResponder } from '../src/chat.js';

const product: CatalogProduct = {
  id: 'product-1',
  slug: 'air-purifier-room-index',
  name: 'Air purifier room index',
  description: 'Current clean-air delivery and filter comparison.',
  status: 'published',
  metadata: { category: 'home' },
  offering: {
    id: 'offering-1',
    rail: 'stripe_mpp',
    amountMinor: 9500,
    currency: 'usd',
    scale: 2,
    networkId: 'profile_test_example',
    active: true,
  },
  endpoint: {
    id: 'endpoint-1',
    method: 'GET',
    path: '/v1/products/air-purifier-room-index/mpp',
    enabled: true,
  },
};

test('shopping responder executes category search and returns exact tool-backed products', async () => {
  const requests: unknown[] = [];
  const responses = [
    {
      output_text: '',
      output: [{
        type: 'function_call',
        name: 'search_products',
        call_id: 'call-1',
        arguments: JSON.stringify({ category: 'home', query: null, maximumAmount: 100 }),
      }],
    },
    {
      output_text: JSON.stringify({
        message: 'I found one current home product under $100.',
        scope: null,
        maximumAmount: null,
        minimumScreenSize: null,
        products: [{
          slug: product.slug,
          name: product.name,
          description: product.description,
          category: 'home',
          price: 95,
          currency: 'USD',
        }],
      }),
      output: [],
    },
  ];
  const client = {
    responses: {
      create: async (request: unknown) => {
        requests.push(request);
        const response = responses.shift();
        if (!response) throw new Error('Unexpected OpenAI request.');
        return response;
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  const result = await responder.respond({ message: 'Show home products under $100', products: [product] });

  assert.equal(requests.length, 2);
  const secondInput = (requests[1] as { input: Array<{ type: string; output?: string }> }).input;
  const toolOutput = secondInput.find((item) => item.type === 'function_call_output');
  assert.deepEqual(JSON.parse(toolOutput?.output ?? '{}'), {
    products: [{
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: 'home',
      price: 95,
      currency: 'USD',
    }],
  });
  assert.deepEqual(result, {
    kind: 'products',
    message: 'I found one current home product under $100.',
    products: [{
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: 'home',
      price: 95,
      currency: 'USD',
    }],
  });
});
