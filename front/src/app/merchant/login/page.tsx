import { MerchantLogin } from "@/components/merchant/merchant-login";
import { isMerchantMockMode } from "@/lib/supabase/config";

function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/merchant/") && !candidate.startsWith("//")
    ? candidate
    : "/merchant/dashboard";
}

export default async function MerchantLoginPage({
  searchParams,
}: PageProps<"/merchant/login">) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return (
    <MerchantLogin
      initialError={error}
      nextPath={safeNext(params.next)}
      mockMode={isMerchantMockMode()}
    />
  );
}
