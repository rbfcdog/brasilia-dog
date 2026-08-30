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
  tool_choice?: unknown;
}

test('shopping responder executes a ranked backend category search and returns exact products', async () => {
  const searches: unknown[] = [];
  const catalog = {
    listProducts: async () => {
      throw new Error('search must not download the full catalog');
    },
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

  const result = await responder.respond({ message: 'Find an ultrawide monitor up to $300', catalog });

  assert.deepEqual(searches, [{
    query: null,
    category: 'home',
    maximumAmountMinor: 10_000,
    slugs: [],
    limit: 10,
  }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0]?.tool_choice, { type: 'function', name: 'search_products' });
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

test('shopping responder forces a catalog search for a Portuguese product request', async () => {
  const requests: CapturedRequest[] = [];
  const client = {
    responses: {
      create: async (request: CapturedRequest) => {
        requests.push(request);
        return {
          output_text: JSON.stringify({
            message: 'What is your budget?',
            scope: null,
            maximumAmount: null,
            minimumScreenSize: null,
            category: null,
            products: [],
          }),
          output: [],
        };
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  await responder.respond({ message: 'Quero comprar um monitor ultrawide.' });

  assert.deepEqual(requests[0]?.tool_choice, { type: 'function', name: 'search_products' });
});

test('shopping responder forces a catalog search for a generic product inquiry', async () => {
  const requests: CapturedRequest[] = [];
  const client = {
    responses: {
      create: async (request: CapturedRequest) => {
        requests.push(request);
        return {
          output_text: JSON.stringify({
            message: 'Which category interests you?',
            scope: null,
            maximumAmount: null,
            minimumScreenSize: null,
            category: null,
            products: [],
          }),
          output: [],
        };
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  await responder.respond({ message: 'Which products do you have?' });

  assert.deepEqual(requests[0]?.tool_choice, { type: 'function', name: 'search_products' });
});

test('shopping responder forces category discovery for a Portuguese category request', async () => {
  const requests: CapturedRequest[] = [];
  const client = {
    responses: {
      create: async (request: CapturedRequest) => {
        requests.push(request);
        return {
          output_text: JSON.stringify({
            message: 'I can browse the catalog categories.',
            scope: null,
            maximumAmount: null,
            minimumScreenSize: null,
            category: null,
            products: [],
          }),
          output: [],
        };
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  await responder.respond({ message: 'Quais categorias vocês têm?' });

  assert.deepEqual(requests[0]?.tool_choice, { type: 'function', name: 'list_product_categories' });
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

test('shopping responder proposes a purchase mandate before any catalog search', async () => {
  const searches: unknown[] = [];
  const lists: unknown[][] = [];
  const catalog = {
    listProducts: async () => {
      const products = [product];
      lists.push(products);
      return products;
    },
    searchProducts: async (input: unknown) => {
      searches.push(input);
      return [product];
    },
  };
  const created: unknown[] = [];
  const client = {
    responses: {
      create: async (request: unknown) => {
        created.push(request);
        throw new Error('The model must not be called before mandate approval.');
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({
    apiKey: 'test-key',
    model: 'test-model',
    now: () => new Date('2026-09-01T00:00:00.000Z'),
    client,
  });

  const result = await responder.respond({ message: 'Buy an ultrawide monitor up to $300', catalog });

  assert.deepEqual(created, []);
  assert.deepEqual(searches, []);
  assert.deepEqual(lists, []);
  assert.equal(result.kind, 'mandate');
  assert.equal(result.message, 'I can search for an ultrawide monitor up to $300.00 after you approve this mandate.');
  assert.deepEqual({
    scope: result.mandate.scope,
    maximumAmount: result.mandate.maximumAmount,
    currency: result.mandate.currency,
    status: result.mandate.status,
    validUntil: result.mandate.validUntil,
    marketplaceScope: result.mandate.marketplaceScope,
  }, {
    scope: 'an ultrawide monitor',
    maximumAmount: 300,
    currency: 'USD',
    status: 'pending',
    validUntil: '2026-09-04T00:00:00.000Z',
    marketplaceScope: {
      query: 'an ultrawide monitor',
      category: 'electronics',
      constraints: [{ field: 'price', operator: 'lte', value: 300 }],
      searchWindowSeconds: 60,
    },
  });
  assert.deepEqual(result.activity, []);
});

test('shopping responder forces exact-slug comparison only for explicit comparison requests', async () => {
  const requests: CapturedRequest[] = [];
  const client = {
    responses: {
      create: async (request: CapturedRequest) => {
        requests.push(request);
        return {
          output_text: JSON.stringify({
            message: 'I need current catalog data.',
            scope: null,
            maximumAmount: null,
            minimumScreenSize: null,
            category: null,
            products: [],
          }),
          output: [],
        };
      },
    },
  } as unknown as OpenAI;
  const responder = new OpenAIShoppingResponder({ apiKey: 'test-key', model: 'test-model', client });

  await responder.respond({ message: 'Compare air-purifier-room-index and robot-vacuum-navigation-report.' });

  assert.deepEqual(requests[0]?.tool_choice, { type: 'function', name: 'compare_products' });
});
