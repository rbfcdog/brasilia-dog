import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProductEndpoint, ProductMethod, ProductRail } from '../domain/types.js';

const ENDPOINT_SELECT = 'id,method,path,response_status,response_body,offering:product_payment_offerings!inner(id,rail,amount_minor,currency,scale,network_id,product:products!inner(id,slug,name,description))';

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

    return mapEndpoint(data as EndpointRow | null);
  }
}
