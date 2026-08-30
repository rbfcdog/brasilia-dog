import type { Mandate, ProductCatalogEntry } from '../domain/types.js';
import type { MandateRepository } from '../repositories/mandate-repository.js';
import type { ProductRepository } from '../repositories/product-repository.js';
import { parseMarketplaceScope, productIsAuthorized } from './marketplace-policy.js';

export class MarketplaceAuthorityService {
  constructor(
    private readonly mandates: MandateRepository,
    private readonly products: ProductRepository,
  ) {}

  async candidates(mandateId: string): Promise<{ mandate: Mandate; candidates: ProductCatalogEntry[] }> {
    const mandate = await this.mandates.getMandate(mandateId);
    if (!mandate) throw new Error('Mandate not found.');
    if (mandate.status !== 'active' || Date.parse(mandate.expiresAt) <= Date.now()) {
      return { mandate, candidates: [] };
    }
    const scope = parseMarketplaceScope(mandate.scope);
    if (!scope) throw new Error('Mandate marketplace scope is invalid.');
    const products = await this.products.searchCatalog({
      query: scope.query,
      category: scope.category,
      maximumAmountMinor: mandate.maxAmountMinor,
      slugs: [],
      limit: 25,
    });
    return { mandate, candidates: products.filter((product) => productIsAuthorized(mandate, product)) };
  }
}
