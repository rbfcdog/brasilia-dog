import { FinanceView } from "@/components/merchant/finance-view";
import { requireMerchant } from "@/lib/supabase/session";

export default async function MerchantFinancePage() {
  await requireMerchant();
  return <FinanceView />;
}
