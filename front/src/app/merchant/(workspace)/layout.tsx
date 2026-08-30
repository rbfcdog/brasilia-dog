import { MerchantShell } from "@/components/merchant/merchant-shell";
import { requireMerchant } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function MerchantWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireMerchant();
  return <MerchantShell businessName={profile.business_name} email={user.email ?? "Merchant account"}>{children}</MerchantShell>;
}
