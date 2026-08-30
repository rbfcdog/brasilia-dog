import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProductCatalogEntry, ProductCatalogSearch, ProductEndpoint, ProductMethod, ProductRail } from '../domain/types.js';

const ENDPOINT_SELECT = 'id,method,path,response_status,response_body,offering:product_payment_offerings!inner(id,rail,amount_minor,currency,scale,network_id,product:products!inner(id,slug,name,description,status,metadata,owner_id))';
const CATALOG_SELECT = 'id,method,path,enabled,offering:product_payment_offerings!inner(id,rail,amount_minor,currency,scale,network_id,active,product:products!inner(id,slug,name,description,status,metadata))';

interface CatalogRow extends Omit<EndpointRow, 'response_status' | 'response_body' | 'offering'> {
  enabled: boolean;
  offering: EndpointRow['offering'] & {
    active: boolean;
    product: EndpointRow['offering']['product'] & {
      status: ProductCatalogEntry['status'];
      metadata: Record<string, unknown>;
    };
  };
}

interface EndpointRow {
  id: string;
  method: ProductMethod;
  path: string;
  response_status: number;
  response_body: Record<string, unknown>;
  offering: {
    id: string;
    rail: ProductRail;
    amount_minor: number;
    currency: string;
    scale: number;
    network_id: string | null;
    product: {
      id: string;
      slug: string;
      name: string;
      description: string;
      status?: ProductCatalogEntry['status'];
      metadata?: Record<string, unknown>;
      owner_id?: string | null;
    };
  };
}

function mapEndpoint(row: EndpointRow | null): ProductEndpoint | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    method: row.method,
    path: row.path,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    offering: {
      id: row.offering.id,
      rail: row.offering.rail,
      amountMinor: row.offering.amount_minor,
      currency: row.offering.currency,
      scale: row.offering.scale,
      networkId: row.offering.network_id,
    },
    product: {
      id: row.offering.product.id,
      slug: row.offering.product.slug,
      name: row.offering.product.name,
      description: row.offering.product.description,
      metadata: row.offering.product.metadata ?? {},
    },
  };
}

function mapCatalogEntry(row: CatalogRow): ProductCatalogEntry {
  return {
    id: row.offering.product.id,
    slug: row.offering.product.slug,
    name: row.offering.product.name,
    description: row.offering.product.description,
    status: row.offering.product.status,
    metadata: row.offering.product.metadata,
    offering: {
      id: row.offering.id,
      rail: row.offering.rail,
      amountMinor: row.offering.amount_minor,
      currency: row.offering.currency,
      scale: row.offering.scale,
      networkId: row.offering.network_id,
      active: row.offering.active,
    },
    endpoint: {
      id: row.id,
      method: row.method,
      path: row.path,
      enabled: row.enabled,
    },
  };
}

export class ProductRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findEnabledEndpoint(method: string, path: string): Promise<ProductEndpoint | null> {
    const { data, error } = await this.client
      .from('product_endpoints')
      .select(ENDPOINT_SELECT)
      .eq('method', method)
      .eq('path', path)
      .eq('offering.rail', 'stripe_mpp')
      .eq('enabled', true)
      .eq('offering.product.status', 'published')
      .eq('offering.active', true)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load a product endpoint.');
    }

    const endpoint = mapEndpoint(data as EndpointRow | null);
    const ownerId = (data as EndpointRow | null)?.offering.product.owner_id;
    if (!endpoint || !ownerId) return endpoint;
    const { data: merchant, error: merchantError } = await this.client
      .from('merchant_profiles')
      .select('user_id, business_name, status')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (merchantError) throw new Error('Could not load the product merchant.');
    endpoint.product.merchant = merchant ? {
      id: (merchant as { user_id: string }).user_id,
      businessName: (merchant as { business_name: string }).business_name,
      status: (merchant as { status: 'active' | 'suspended' }).status,
    } : null;
    return endpoint;
  }

  async listCatalog(): Promise<ProductCatalogEntry[]> {
    const { data, error } = await this.client
      .from('product_endpoints')
      .select(CATALOG_SELECT)
      .eq('offering.rail', 'stripe_mpp')
      .order('path', { ascending: true });

    if (error) {
      throw new Error('Could not load the product catalog.');
    }

    return (data as unknown as CatalogRow[]).map(mapCatalogEntry);
  }

  async searchCatalog(input: ProductCatalogSearch): Promise<ProductCatalogEntry[]> {
    const { data, error } = await this.client.rpc('search_agent_mpp_products', {
      p_query: input.query,
      p_category: input.category,
      p_maximum_amount_minor: input.maximumAmountMinor,
      p_slugs: input.slugs,
      p_limit: input.limit,
    });

    if (error || !Array.isArray(data)) {
      throw new Error('Could not search the product catalog.');
    }

    return data as ProductCatalogEntry[];
  }
}
