import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "payment",
] as const;

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "www-authenticate",
  "x-agent-execution-proof-id",
] as const;

function isAllowedPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/openapi.json" ||
    /^\/passkey\/(?:register|auth)\/(?:options|verify)$/.test(pathname) ||
    /^\/passkey\/session\/(?:verify|revoke)$/.test(pathname) ||
    pathname === "/v1/passkeys/status" ||
    pathname === "/v1/chat" ||
    /^\/v1\/products\/[^/]+\/(?:info|purchase)$/.test(pathname) ||
    pathname === "/v1/agents" ||
    /^\/v1\/agents\/[^/]+(?:\/(?:status|activity))?$/.test(pathname) ||
    pathname === "/v1/mandates" ||
    /^\/v1\/mandates\/[^/]+(?:\/revoke)?$/.test(pathname) ||
    pathname === "/v1/payments" ||
    /^\/v1\/payments\/[^/]+$/.test(pathname) ||
    pathname === "/v1/conversations" ||
    /^\/v1\/conversations\/[^/]+\/messages$/.test(pathname) ||
    /^\/v1\/conversations\/[^/]+\/events$/.test(pathname) ||
    pathname === "/v1/merchant/session" ||
    pathname === "/v1/merchant/dashboard" ||
    pathname === "/v1/merchant/orders" ||
    /^\/v1\/merchant\/orders\/[^/]+\/audit$/.test(pathname) ||
    pathname === "/v1/merchant/catalog" ||
    pathname === "/v1/merchant/finance" ||
    pathname === "/v1/merchant/products" ||
    /^\/v1\/merchant\/products\/[^/]+\/publish$/.test(pathname) ||
    pathname === "/v1/merchant/refund-cases"
  );
}

function backendUrl(pathname: string, search: string): URL | null {
  const configuredUrl = process.env.BACKEND_API_URL?.trim();
  if (!configuredUrl) return null;

  const baseUrl = new URL(configuredUrl);
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new Error("BACKEND_API_URL must use http or https.");
  }

  const normalizedBasePath = baseUrl.pathname.replace(/\/$/, "");
  baseUrl.pathname = `${normalizedBasePath}${pathname}`;
  baseUrl.search = search;
  return baseUrl;
}

async function ensureFreshAccessToken(cookieStore: Awaited<ReturnType<typeof cookies>>): Promise<string | null> {
  const accessToken = cookieStore.get("nomad-auth-access")?.value;
  if (accessToken) {
    // Verify it works by checking if it's likely still valid (has JWT structure and not expired)
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1] ?? ""));
      if (payload.exp && payload.exp * 1000 > Date.now()) return accessToken;
    } catch {
      // Not a JWT or can't parse, use it anyway
      return accessToken;
    }
  }
  // Token missing or expired, try refresh
  const refreshToken = cookieStore.get("nomad-auth-refresh")?.value;
  if (!refreshToken) return null;
  const base = process.env.BACKEND_API_URL?.trim();
  if (!base) return null;
  try {
    const response = await fetch(new URL("v1/auth/refresh", base.endsWith("/") ? base : `${base}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { session?: { accessToken?: string; refreshToken?: string } };
    const newAccess = payload.session?.accessToken;
    const newRefresh = payload.session?.refreshToken;
    if (newAccess) {
      cookieStore.set("nomad-auth-access", newAccess, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 3600,
      });
    }
    if (newRefresh) {
      cookieStore.set("nomad-auth-refresh", newRefresh, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: "/", maxAge: 30 * 24 * 3600,
      });
    }
    return newAccess ?? null;
  } catch {
    return null;
  }
}

async function requestHeaders(request: Request, pathname: string): Promise<Headers> {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookieStore = await cookies();
  const passkeyRoute = /^\/passkey\/(?:register|auth)\//.test(pathname);
  const chatRoute = pathname === "/v1/chat" || pathname === "/v1/conversations" || /^\/v1\/conversations\//.test(pathname);

  // Chat and conversation routes: prefer Supabase account token, fall back to
  // passkey session. The BFF is the sole authority for auth headers.
  if (chatRoute) {
    const accessToken = await ensureFreshAccessToken(cookieStore);
    if (!headers.has("authorization") && accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }
    const passkeySession = cookieStore.get("nomad-passkey-session")?.value;
    if (!headers.has("authorization") && !passkeyRoute && passkeySession) {
      headers.set("authorization", `Bearer ${passkeySession}`);
    }
  } else {
    const passkeySession = cookieStore.get("nomad-passkey-session")?.value;
    if (!headers.has("authorization") && !passkeyRoute && passkeySession) {
      headers.set("authorization", `Bearer ${passkeySession}`);
    }
    if (!headers.has("authorization") || passkeyRoute) {
      const accessToken = cookieStore.get("nomad-auth-access")?.value;
      if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    }
  }
  if (/^\/passkey\/(?:register|auth)\//.test(pathname)) {
    const enrollmentToken = cookieStore.get("nomad-passkey-enrollment")?.value;
    if (enrollmentToken) {
      headers.delete("authorization");
      headers.set("x-passkey-enrollment", enrollmentToken);
    }
  }
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const pathname = `/${path.map(encodeURIComponent).join("/")}`;
  const chatRoute = pathname === "/v1/chat" || pathname === "/v1/conversations" || /^\/v1\/conversations\//.test(pathname);

  if (!isAllowedPath(pathname)) {
    return NextResponse.json({ error: "backend_path_not_allowed" }, { status: 404 });
  }

  let target: URL | null;
  try {
    target = backendUrl(pathname, new URL(request.url).search);
  } catch (error) {
    return NextResponse.json(
      { error: "backend_configuration_invalid", detail: (error as Error).message },
      { status: 503 },
    );
  }

  if (!target) {
    return NextResponse.json({ error: "backend_unavailable" }, { status: 503 });
  }
  try {
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const bodyBuffer = hasBody ? await request.arrayBuffer() : null;
    const headers = await requestHeaders(request, pathname);

    let upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(hasBody ? { body: bodyBuffer } : {}),
      cache: "no-store",
    });

    // If chat route returns 401, try refreshing the token and retry once
    if (upstream.status === 401 && chatRoute) {
      const cookieStore = await cookies();
      const freshToken = await ensureFreshAccessToken(cookieStore);
      if (freshToken) {
        headers.set("authorization", `Bearer ${freshToken}`);
        upstream = await fetch(target, {
          method: request.method,
          headers,
          ...(hasBody ? { body: bodyBuffer } : {}),
          cache: "no-store",
        });
      }
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      return NextResponse.json(
        { error: "backend_invalid_response", detail: "The backend gateway returned a non-JSON response." },
        { status: 502 },
      );
    }

    const responseBody = await upstream.arrayBuffer();
    const response = new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
    if (upstream.ok && /^\/passkey\/(?:register|auth)\/verify$/.test(pathname)) {
      response.headers.append("Set-Cookie", "nomad-passkey-enrollment=; Max-Age=0; Path=/api/backend/passkey; HttpOnly; SameSite=Strict");
    }
    if (upstream.ok && pathname === "/passkey/auth/verify") {
      const payload = JSON.parse(new TextDecoder().decode(responseBody)) as { sessionToken?: unknown };
      if (typeof payload.sessionToken === "string" && payload.sessionToken.length > 0) {
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        response.headers.append("Set-Cookie", `nomad-passkey-session=${encodeURIComponent(payload.sessionToken)}; Max-Age=86400; Path=/api/backend; HttpOnly; SameSite=Strict${secure}`);
        response.headers.append("Set-Cookie", `nomad-passkey-authenticated=1; Max-Age=86400; Path=/; SameSite=Strict${secure}`);
      }
    }
    return response;
  } catch {
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
