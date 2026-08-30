import { PasskeyEnrollment } from "@/components/auth/passkey-enrollment";

export default async function PasskeyEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  return <PasskeyEnrollment initialError={error} />;
}
