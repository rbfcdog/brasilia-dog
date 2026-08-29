import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { SupabaseConfig } from '../domain/types.js';

export function createSupabaseClient(supabaseConfig: SupabaseConfig | null): SupabaseClient | null {
  if (!supabaseConfig) {
    return null;
  }

  return createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
