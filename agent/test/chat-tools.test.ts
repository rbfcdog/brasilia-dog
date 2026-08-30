import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';

import type { CatalogProduct } from '../src/adapters.js';
import { AgentError } from '../src/errors.js';
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
interface CapturedRequest {
  input?: Array<{ type: string; output?: string }>;
}

test('shopping responder executes a ranked backend category search and returns exact products', async () => {
  const searches: unknown[] = [];
  const catalog = {
    listProducts: async () => [product],
    searchProducts: async (input: unknown) => {
      searches.push(input);
      return [product];
    },
  };
  const requests: CapturedRequest[] = [];
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
      create: async (request: CapturedRequest) => {
        requests.push(request);
        const response = responses.shift();
        if (!response) throw new Error('Unexpected OpenAI request.');
        return response;
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  const result = await responder.respond({ message: 'Show home products under $100', catalog });

  assert.deepEqual(searches, [{
    query: null,
    category: 'home',
    maximumAmountMinor: 10_000,
    slugs: [],
    limit: 10,
  }]);
  assert.equal(requests.length, 2);
  const toolOutput = requests[1]?.input?.find((item) => item.type === 'function_call_output');
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
    activity: [{
      type: 'catalog_search',
      category: 'home',
      query: null,
      maximumAmount: 100,
      resultSlugs: [product.slug],
    }],
  });
});

test('shopping responder returns catalog products when the model omits them after a successful search', async () => {
  const catalog = {
    listProducts: async () => [product],
    searchProducts: async () => [product],
  };
  const responses = [
    {
      output_text: '',
      output: [{
        type: 'function_call',
        name: 'search_products',
        call_id: 'call-search',
        arguments: JSON.stringify({ category: 'home', query: 'appliance', maximumAmount: 100 }),
      }],
    },
    {
      output_text: JSON.stringify({
        message: 'I could not find matching products.',
        scope: null,
        maximumAmount: null,
        minimumScreenSize: null,
        products: [],
      }),
      output: [],
    },
  ];
  const client = {
    responses: {
      create: async () => {
        const response = responses.shift();
        if (!response) throw new Error('Unexpected OpenAI request.');
        return response;
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  const result = await responder.respond({ message: 'Compra um eletrodoméstico de 100 reais.', catalog });

  assert.deepEqual(result, {
    kind: 'products',
    message: 'I found 1 current catalog product matching your search.',
    products: [{
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: 'home',
      price: 95,
      currency: 'USD',
    }],
    activity: [{
      type: 'catalog_search',
      category: 'home',
      query: 'appliance',
      maximumAmount: 100,
      resultSlugs: [product.slug],
    }],
  });
});

test('shopping responder follows a model-led search with an exact product comparison before answering', async () => {
  const catalog = {
    listProducts: async () => [product],
    searchProducts: async () => [product],
  };
  const responses = [
    {
      output_text: '',
      output: [{
        type: 'function_call',
        name: 'search_products',
        call_id: 'call-search',
        arguments: JSON.stringify({ category: 'home', query: 'air purifier', maximumAmount: 100 }),
      }],
    },
    {
      output_text: '',
      output: [{
        type: 'function_call',
        name: 'compare_products',
        call_id: 'call-compare',
        arguments: JSON.stringify({ slugs: [product.slug] }),
      }],
    },
    {
      output_text: JSON.stringify({
        message: 'The catalog comparison confirms this model is within your budget.',
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
      create: async () => {
        const response = responses.shift();
        if (!response) throw new Error('Unexpected OpenAI request.');
        return response;
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  const result = await responder.respond({ message: 'Compare an air purifier under $100.', catalog });

  assert.deepEqual(result.activity, [
    {
      type: 'catalog_search',
      category: 'home',
      query: 'air purifier',
      maximumAmount: 100,
      resultSlugs: [product.slug],
    },
    {
      type: 'product_comparison',
      requestedSlugs: [product.slug],
      resultSlugs: [product.slug],
    },
  ]);
});

test('shopping responder preserves backend catalog failures', async () => {
  const backendFailure = new AgentError(
    'BACKEND_REQUEST_FAILED',
    'The backend returned HTTP 404.',
    502,
  );
  const catalog = {
    listProducts: async () => [],
    searchProducts: async () => {
      throw backendFailure;
    },
  };
  const client = {
    responses: {
      create: async () => ({
        output_text: '',
        output: [{
          type: 'function_call',
          name: 'search_products',
          call_id: 'call-1',
          arguments: JSON.stringify({ category: 'home', query: null, maximumAmount: 100 }),
        }],
      }),
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  await assert.rejects(
    responder.respond({ message: 'Show home products under $100', catalog }),
    (error: unknown) => error === backendFailure,
  );
});

test('shopping responder returns verified tool results when the model selection is invalid', async () => {
  const catalog = {
    listProducts: async () => [product],
    searchProducts: async () => [product],
  };
  const responses = [
    {
      output_text: '',
      output: [{
        type: 'function_call',
        name: 'search_products',
        call_id: 'call-search',
        arguments: JSON.stringify({ category: 'home', query: null, maximumAmount: 100 }),
      }],
    },
    {
      output_text: '{"message":"missing required fields"}',
      output: [],
    },
  ];
  const client = {
    responses: {
      create: async () => {
        const response = responses.shift();
        if (!response) throw new Error('Unexpected OpenAI request.');
        return response;
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  const result = await responder.respond({ message: 'Show home products under $100', catalog });

  assert.deepEqual(result, {
    kind: 'products',
    message: 'I found 1 current catalog product matching your search.',
    products: [{
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: 'home',
      price: 95,
      currency: 'USD',
    }],
    activity: [{
      type: 'catalog_search',
      category: 'home',
      query: null,
      maximumAmount: 100,
      resultSlugs: [product.slug],
    }],
  });
});
