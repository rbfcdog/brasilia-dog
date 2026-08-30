import { redirect } from "next/navigation";
import { isMerchantMockMode } from "@/lib/supabase/config";
import { createMerchantServerClient } from "@/lib/supabase/server";

export async function requireMerchant() {
  if (isMerchantMockMode()) {
    return {
      user: {
        id: "merchant-demo-user",
        email: "demo@northstar.supply",
      },
      profile: {
        user_id: "merchant-demo-user",
        business_name: "Northstar Supply · Demo",
        status: "active" as const,
        created_at: new Date().toISOString(),
      },
    };
  }

  const supabase = await createMerchantServerClient();
  if (!supabase) redirect("/merchant/login?error=not_configured");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/merchant/login");

  const { data: profile } = await supabase
    .from("merchant_profiles")
    .select("user_id,business_name,status,created_at")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return {
    user: data.user,
    profile: profile ?? {
      user_id: data.user.id,
      business_name:
        data.user.user_metadata.business_name ??
        data.user.email?.split("@")[0] ??
        "Merchant",
      status: "active",
      created_at: data.user.created_at,
    },
  };
}
