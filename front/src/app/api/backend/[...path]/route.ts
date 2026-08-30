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

async function requestHeaders(request: Request, pathname: string): Promise<Headers> {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookieStore = await cookies();
  const passkeyRoute = /^\/passkey\/(?:register|auth)\//.test(pathname);
  if (!headers.has("authorization") || passkeyRoute) {
    const accessToken = cookieStore.get("nomad-auth-access")?.value;
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  }
  if (pathname.startsWith("/passkey/register/")) {
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
    const upstream = await fetch(target, {
      method: request.method,
      headers: await requestHeaders(request, pathname),
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      cache: "no-store",
    });

    const response = new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
    if (upstream.ok && pathname === "/passkey/register/verify") {
      response.headers.append("Set-Cookie", "nomad-passkey-enrollment=; Max-Age=0; Path=/api/backend/passkey/register; HttpOnly; SameSite=Strict");
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
