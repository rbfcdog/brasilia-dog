import assert from 'node:assert/strict';
import test from 'node:test';

import type { Mandate, ProductCatalogEntry } from '../src/domain/types.js';
import {
  metadataMatches,
  parseMarketplaceScope,
  productIsAuthorized,
} from '../src/services/marketplace-policy.js';

const scope = {
  query: '34-inch ultrawide monitor',
  category: 'electronics',
  constraints: [
    { field: 'panel', operator: 'eq' as const, value: 'IPS' },
    { field: 'screen_size_inches', operator: 'gte' as const, value: 34 },
    { field: 'refresh_hz', operator: 'lte' as const, value: 165 },
  ],
  searchWindowSeconds: 60 as const,
};

function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    id: 'mandate-1', ownerId: 'owner-1', agentIdentityId: 'agent-1', version: 1,
    status: 'active', scope, maxAmountMinor: 30_000, currency: 'usd',
    expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function product(overrides: Partial<ProductCatalogEntry> = {}): ProductCatalogEntry {
  return {
    id: 'product-1', slug: 'aster-34', name: 'Aster 34', description: 'Monitor', status: 'published',
    metadata: { category: 'Electronics', panel: '  ips ', screen_size_inches: 34, refresh_hz: 144 },
    merchant: { id: 'merchant-1', businessName: 'Northstar', status: 'active' },
    offering: { id: 'offering-1', rail: 'stripe_mpp', amountMinor: 29_243, currency: 'USD', scale: 2, networkId: 'profile-test', active: true },
    endpoint: { id: 'endpoint-1', method: 'POST', path: '/v1/agent/products/aster-34/purchase', enabled: true },
    ...overrides,
  };
}

test('parses the bounded eq/gte/lte marketplace scope', () => {
  assert.deepEqual(parseMarketplaceScope(scope), scope);
});

test('rejects more than eight constraints and complex field paths', () => {
  assert.equal(parseMarketplaceScope({ ...scope, constraints: Array.from({ length: 9 }, (_, index) => ({ field: `field_${index}`, operator: 'eq', value: true })) }), null);
  assert.equal(parseMarketplaceScope({ ...scope, constraints: [{ field: 'nested.field', operator: 'eq', value: true }] }), null);
});

test('requires numeric values for gte and lte', () => {
  assert.equal(parseMarketplaceScope({ ...scope, constraints: [{ field: 'screen_size_inches', operator: 'gte', value: '34' }] }), null);
});

test('normalizes string equality and compares numeric metadata without coercion', () => {
  assert.equal(metadataMatches({ panel: '  ÍPS ', size: 34 }, [
    { field: 'panel', operator: 'eq', value: 'íps' },
    { field: 'size', operator: 'gte', value: 34 },
  ]), true);
  assert.equal(metadataMatches({ size: '34' }, [{ field: 'size', operator: 'gte', value: 34 }]), false);
});

test('authorizes a published compatible product from an active merchant', () => {
  assert.equal(productIsAuthorized(mandate(), product()), true);
});

test('rejects a product above the mandate maximum', () => {
  assert.equal(productIsAuthorized(mandate(), product({ offering: { ...product().offering, amountMinor: 30_001 } })), false);
});

test('rejects incompatible metadata and an inactive merchant', () => {
  assert.equal(productIsAuthorized(mandate(), product({ metadata: { ...product().metadata, panel: 'VA' } })), false);
  assert.equal(productIsAuthorized(mandate(), product({ merchant: { id: 'merchant-1', businessName: 'Northstar', status: 'suspended' } })), false);
});

test('rejects expired or revoked authority and disabled product state', () => {
  assert.equal(productIsAuthorized(mandate({ expiresAt: new Date(Date.now() - 1).toISOString() }), product()), false);
  assert.equal(productIsAuthorized(mandate({ status: 'revoked' }), product()), false);
  assert.equal(productIsAuthorized(mandate(), product({ endpoint: { ...product().endpoint, enabled: false } })), false);
});
