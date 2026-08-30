import { OrdersView } from "@/components/merchant/orders-view";
import { requireMerchant } from "@/lib/supabase/session";

export default async function MerchantOrdersPage() {
  await requireMerchant();
  return <OrdersView />;
}
