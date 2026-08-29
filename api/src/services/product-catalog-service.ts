import type { ProductEndpoint, ProductEndpointRepository } from '../domain/types.js';

export class ProductCatalogService {
  constructor(private readonly productRepository: ProductEndpointRepository) {}

  async resolve(request: Request): Promise<ProductEndpoint | null> {
    const { pathname } = new URL(request.url);

    if (!pathname.startsWith('/v1/products/')) {
      return null;
    }

    return this.productRepository.findEnabledEndpoint(request.method, pathname);
  }
}
