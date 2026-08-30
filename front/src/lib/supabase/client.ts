"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createMerchantBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Merchant authentication is not configured.");
  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}
