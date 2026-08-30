import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function requireMerchant() {
  const store = await cookies();
  let accessToken = store.get("vero-auth-access")?.value;
  const refreshToken = store.get("vero-auth-refresh")?.value;
  const backend = process.env.BACKEND_API_URL?.trim();
  if (!backend || (!accessToken && !refreshToken)) redirect("/merchant/login");

  const load = (token: string) => fetch(new URL("/v1/merchant/session", backend), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  let response = accessToken ? await load(accessToken) : null;
  if ((!response || response.status === 401) && refreshToken) {
    const refresh = await fetch(new URL("/v1/auth/refresh", backend), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    const payload = await refresh.json().catch(() => null) as { session?: { accessToken?: string } } | null;
    accessToken = payload?.session?.accessToken;
    if (accessToken) response = await load(accessToken);
  }
  if (!response?.ok) redirect("/merchant/login");
  return response.json() as Promise<{
    user: { id: string; email: string | null };
    profile: { user_id: string; business_name: string; status: "active" | "suspended"; created_at: string };
  }>;
}
