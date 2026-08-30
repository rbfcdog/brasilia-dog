import type { MarketplaceConstraint, MarketplaceScope, Mandate, ProductCatalogEntry, ProductEndpoint } from '../domain/types.js';

const SIMPLE_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function parseConstraint(value: unknown): MarketplaceConstraint | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.field !== 'string' || !SIMPLE_FIELD.test(item.field)) return null;
  if (item.operator !== 'eq' && item.operator !== 'gte' && item.operator !== 'lte') return null;
  if (typeof item.value !== 'string' && typeof item.value !== 'number' && typeof item.value !== 'boolean') return null;
  if (typeof item.value === 'number' && !Number.isFinite(item.value)) return null;
  if ((item.operator === 'gte' || item.operator === 'lte') && typeof item.value !== 'number') return null;
  return { field: item.field, operator: item.operator, value: item.value };
}

export function parseMarketplaceScope(value: unknown): MarketplaceScope | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  if (typeof scope.query !== 'string' || scope.query.trim().length < 1 || scope.query.length > 500) return null;
  if (typeof scope.category !== 'string' || scope.category.trim().length < 1 || scope.category.length > 80) return null;
  if (scope.searchWindowSeconds !== 60 || !Array.isArray(scope.constraints) || scope.constraints.length > 8) return null;
  const constraints = scope.constraints.map(parseConstraint);
  if (constraints.some((item) => item === null)) return null;
  return {
    query: scope.query.trim(),
    category: scope.category.trim(),
    constraints: constraints as MarketplaceConstraint[],
    searchWindowSeconds: 60,
  };
}

export function metadataMatches(metadata: Record<string, unknown>, constraints: MarketplaceConstraint[]): boolean {
  return constraints.every((constraint) => {
    const actual = metadata[constraint.field];
    if (constraint.operator === 'eq') {
      if (typeof constraint.value === 'string') {
        return typeof actual === 'string' && normalized(actual) === normalized(constraint.value);
      }
      return actual === constraint.value;
    }
    if (typeof actual !== 'number' || !Number.isFinite(actual) || typeof constraint.value !== 'number') return false;
    return constraint.operator === 'gte' ? actual >= constraint.value : actual <= constraint.value;
  });
}

type AuthorizableProduct = Pick<ProductCatalogEntry, 'status' | 'metadata' | 'offering' | 'endpoint' | 'merchant'>;

export function productIsAuthorized(mandate: Mandate, product: AuthorizableProduct): boolean {
  const scope = parseMarketplaceScope(mandate.scope);
  if (!scope) return false;
  return mandate.status === 'active'
    && Date.parse(mandate.expiresAt) > Date.now()
    && product.status === 'published'
    && product.offering.active
    && product.endpoint.enabled
    && product.offering.amountMinor <= mandate.maxAmountMinor
    && normalized(product.offering.currency) === normalized(mandate.currency)
    && product.merchant?.status === 'active'
    && typeof product.metadata.category === 'string'
    && normalized(product.metadata.category) === normalized(scope.category)
    && metadataMatches(product.metadata, scope.constraints);
}

export function endpointIsAuthorized(mandate: Mandate, endpoint: ProductEndpoint): boolean {
  return productIsAuthorized(mandate, {
    status: 'published',
    metadata: endpoint.product.metadata ?? {},
    merchant: endpoint.product.merchant,
    offering: { ...endpoint.offering, active: true },
    endpoint: { id: endpoint.id, method: endpoint.method, path: endpoint.path, enabled: true },
  });
}
