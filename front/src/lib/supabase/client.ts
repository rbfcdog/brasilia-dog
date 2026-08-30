"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createMerchantBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy the frontend.");
  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}
