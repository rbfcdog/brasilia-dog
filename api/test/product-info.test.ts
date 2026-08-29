import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/http/app.js';
import type { MppHandler, Product } from '../src/domain/types.js';
import type { ProductInfoRepository } from '../src/repositories/product-info-repository.js';

const paidHandler: MppHandler = async () => new Response('paid', { status: 200 });

class MockProductInfoRepository implements Pick<ProductInfoRepository, 'findBySlug'> {
  private readonly products = new Map<string, Product>();

  addProduct(product: Product): void {
    this.products.set(product.slug, product);
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return this.products.get(slug) ?? null;
  }
}

test('product info endpoint returns product data by slug', async () => {
  const repo = new MockProductInfoRepository();
  repo.addProduct({
    id: 'prod-1',
    slug: 'market-signal-sandbox',
    name: 'Market signal sandbox',
    description: 'A sandbox product for testing.',
  });

  const app = createApp({ paidHandler, productInfoRepository: repo as unknown as ProductInfoRepository });

  const response = await app(new Request('http://localhost/v1/products/market-signal-sandbox/info'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.product.slug, 'market-signal-sandbox');
  assert.equal(body.product.name, 'Market signal sandbox');
});

test('product info endpoint returns 404 for unknown slug', async () => {
  const repo = new MockProductInfoRepository();

  const app = createApp({ paidHandler, productInfoRepository: repo as unknown as ProductInfoRepository });

  const response = await app(new Request('http://localhost/v1/products/nonexistent/info'));

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, 'product_not_found');
});

test('product info endpoint returns 400 when slug is missing', async () => {
  const repo = new MockProductInfoRepository();

  const app = createApp({ paidHandler, productInfoRepository: repo as unknown as ProductInfoRepository });

  // /v1/products//info -> slug is empty string
  const response = await app(new Request('http://localhost/v1/products//info'));

  assert.equal(response.status, 400);
});
