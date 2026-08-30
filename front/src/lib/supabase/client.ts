"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, missingSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function createMerchantBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  if (!config) {
    const missing = missingSupabasePublicConfig();
    throw new Error(`Supabase authentication is not configured. Missing: ${missing.join(", ")}. Add the variable${missing.length === 1 ? "" : "s"} to the frontend deployment and redeploy.`);
  }
  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}
