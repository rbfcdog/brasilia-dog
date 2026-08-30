import { DashboardView } from "@/components/merchant/dashboard-view";
import { requireMerchant } from "@/lib/supabase/session";

export default async function MerchantDashboardPage() {
  await requireMerchant();
  return <DashboardView />;
}
