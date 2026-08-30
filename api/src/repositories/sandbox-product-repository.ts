import type {
  ProductCatalogEntry,
  ProductCatalogRepository,
  ProductCatalogSearch,
} from '../domain/types.js';

const FIXTURES = [
  {
    slug: 'ultrawide-monitor-buying-guide',
    name: 'Ultrawide monitor buying guide',
    description: 'Current comparison data for ultrawide monitors, panels, ports, and ergonomics.',
    category: 'electronics',
    keywords: 'monitor monitors tela telas ultrawide',
    amountMinor: 250,
  },
  {
    slug: 'noise-cancelling-headphone-index',
    name: 'Noise-cancelling headphone index',
    description: 'Current headphone pricing, codec, battery, and comfort data.',
    category: 'electronics',
    keywords: 'headphone headphones fone fones ouvido audio',
    amountMinor: 225,
  },
  {
    slug: 'running-shoe-fit-index',
    name: 'Running shoe fit index',
    description: 'Current running shoe geometry, cushioning, durability, and fit data.',
    category: 'sports',
    keywords: 'shoe shoes running corrida tenis tênis',
    amountMinor: 160,
  },
  {
    slug: 'travel-luggage-durability-index',
    name: 'Travel luggage durability index',
    description: 'Current luggage material, wheel, warranty, capacity, and price data.',
    category: 'travel',
    keywords: 'luggage suitcase travel bagagem mala malas viagem',
    amountMinor: 170,
  },
  {
    slug: 'air-purifier-room-index',
    name: 'Air purifier room index',
    description: 'Current clean-air delivery, filter, noise, and room-size comparison.',
    category: 'home',
    keywords: 'air purifier purificador ar filtro casa',
    amountMinor: 195,
  },
  {
    slug: 'project-management-software-index',
    name: 'Project management software index',
    description: 'Current project management pricing, controls, integrations, and limits.',
    category: 'software',
    keywords: 'project management software projeto projetos gestao gestão',
    amountMinor: 300,
  },
] as const;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export class SandboxProductRepository implements ProductCatalogRepository {
  private readonly products: ProductCatalogEntry[];

  constructor(networkId: string) {
    this.products = FIXTURES.map((fixture, index) => ({
      id: `demo-product-${index + 1}`,
      slug: fixture.slug,
      name: fixture.name,
      description: fixture.description,
      status: 'published',
      metadata: {
        category: fixture.category,
        source: 'sandbox',
        keywords: fixture.keywords,
      },
      offering: {
        id: `demo-offering-${index + 1}`,
        rail: 'stripe_mpp',
        amountMinor: fixture.amountMinor,
        currency: 'usd',
        scale: 2,
        networkId,
        active: true,
      },
      endpoint: {
        id: `demo-endpoint-${index + 1}`,
        method: 'GET',
        path: `/v1/products/${fixture.slug}/mpp`,
        enabled: true,
      },
    }));
  }

  async listCatalog(): Promise<ProductCatalogEntry[]> {
    return structuredClone(this.products);
  }

  async searchCatalog(input: ProductCatalogSearch): Promise<ProductCatalogEntry[]> {
    const queryTerms = normalize(input.query?.trim() ?? '')
      .split(/\s+/)
      .filter((term) => term && !['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os', 'para'].includes(term));
    const category = input.category?.trim().toLowerCase() ?? null;
    const slugs = new Set(input.slugs);
    const matches = this.products.filter((product) => {
      const productCategory = typeof product.metadata.category === 'string'
        ? product.metadata.category.toLowerCase()
        : '';
      const searchable = normalize([
        product.slug,
        product.name,
        product.description,
        productCategory,
        typeof product.metadata.keywords === 'string' ? product.metadata.keywords : '',
      ].join(' '));
      return (slugs.size === 0 || slugs.has(product.slug))
        && (!category || productCategory === category)
        && (input.maximumAmountMinor === null || product.offering.amountMinor <= input.maximumAmountMinor)
        && queryTerms.every((term) => searchable.includes(term)
          || (term.endsWith('s') && term.length > 3 && searchable.includes(term.slice(0, -1))));
    });
    return structuredClone(matches.slice(0, input.limit));
  }
}
