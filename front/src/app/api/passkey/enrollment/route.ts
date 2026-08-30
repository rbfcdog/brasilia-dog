import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function backend(path: string): URL | null {
  const base = process.env.BACKEND_API_URL?.trim();
  return base ? new URL(path, base.endsWith("/") ? base : `${base}/`) : null;
}

export async function POST(request: Request): Promise<Response> {
  const target = backend("v1/passkey/enrollments");
  const accessToken = (await cookies()).get("vero-auth-access")?.value;
  if (!target || !accessToken) return Response.json({ error: "authentication_required" }, { status: 401 });

  const upstream = await fetch(target, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await upstream.json().catch(() => null) as { token?: string; expiresAt?: string; error?: string; detail?: string } | null;
  const detail = payload && typeof payload.detail === "string" ? payload.detail : "Enrollment grant creation failed.";
  if (!upstream.ok || !payload?.token || !payload.expiresAt) {
    return Response.json({ error: payload?.error ?? "enrollment_unavailable", detail }, { status: upstream.status || 503 });
  }
  const claim = new URL("/api/passkey/enrollment/claim", request.url);
  claim.searchParams.set("token", payload.token);
  return Response.json({ enrollmentUrl: claim.toString(), expiresAt: payload.expiresAt });
}
