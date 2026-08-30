import { OrdersView } from "@/components/merchant/orders-view";
import { requireMerchant } from "@/lib/merchant-session"

export default async function MerchantOrdersPage() {
  await requireMerchant();
  return <OrdersView />;
}
