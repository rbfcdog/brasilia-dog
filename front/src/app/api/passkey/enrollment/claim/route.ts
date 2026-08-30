import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const base = process.env.BACKEND_API_URL?.trim();
  if (!token || !base) return NextResponse.redirect(new URL("/passkey/enroll?error=invalid", request.url), 303);

  const upstream = await fetch(new URL("/v1/passkey/enrollments/claim", base.endsWith("/") ? base : `${base}/`), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!upstream.ok) return NextResponse.redirect(new URL("/passkey/enroll?error=expired", request.url), 303);

  const response = NextResponse.redirect(new URL("/passkey/enroll", request.url), 303);
  response.cookies.set("nomad-passkey-enrollment", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/backend/passkey",
    maxAge: 5 * 60,
  });
  return response;
}
