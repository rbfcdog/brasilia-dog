import { MerchantLogin } from "@/components/merchant/merchant-login";

function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/merchant/") && !candidate.startsWith("//")
    ? candidate
    : "/merchant/dashboard";
}

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return (
    <MerchantLogin
      initialError={error}
      nextPath={safeNext(params.next)}
    />
  );
}
