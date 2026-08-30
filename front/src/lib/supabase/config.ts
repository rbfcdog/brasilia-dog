export function getSupabasePublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function isMerchantMockMode(): boolean {
  const configured = process.env.NEXT_PUBLIC_MERCHANT_MOCK_AUTH?.trim();

  if (configured === "true") return true;
  if (configured === "false") return false;

  return process.env.NODE_ENV === "development";
}
