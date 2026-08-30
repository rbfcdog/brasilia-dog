import { CatalogView } from "@/components/merchant/catalog-view";
import { requireMerchant } from "@/lib/supabase/session";

export default async function MerchantCatalogPage() {
  await requireMerchant();
  return <CatalogView />;
}
