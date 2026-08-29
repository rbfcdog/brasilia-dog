import type { SupabaseClient } from '@supabase/supabase-js';

import type { Product } from '../domain/types.js';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export class ProductInfoRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findBySlug(slug: string): Promise<Product | null> {
    const { data, error } = await this.client
      .from('products')
      .select('id, slug, name, description, status, metadata')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      throw new Error('Could not load product.');
    }

    if (!data) {
      return null;
    }

    const row = data as ProductRow;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      ...(row.metadata ? { metadata: row.metadata } : {}),
    };
  }
}
