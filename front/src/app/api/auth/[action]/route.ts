import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_COOKIE = "vero-auth-access";
const REFRESH_COOKIE = "vero-auth-refresh";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function apiUrl(path: string): URL | null {
  const configured = process.env.BACKEND_API_URL?.trim();
  return configured ? new URL(path, configured.endsWith("/") ? configured : `${configured}/`) : null;
}

async function upstream(path: string, init: RequestInit): Promise<Response> {
  const target = apiUrl(path);
  if (!target) return Response.json({ error: "backend_unavailable" }, { status: 503 });
  try {
    return await fetch(target, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 });
  }
}

async function storeSession(payload: unknown): Promise<boolean> {
  if (!payload || typeof payload !== "object" || !("session" in payload)) return false;
  const session = payload.session;
  if (!session || typeof session !== "object" || !("accessToken" in session) || !("refreshToken" in session)) return false;
  if (typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") return false;
  const store = await cookies();
  store.set(ACCESS_COOKIE, session.accessToken, { ...cookieOptions, maxAge: 3600 });
  store.set(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 3600 });
  return true;
}

async function refreshSession(): Promise<{ accessToken: string; payload: unknown } | null> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const response = await upstream("v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !(await storeSession(payload))) return null;
  const session = (payload as { session: { accessToken: string } }).session;
  return { accessToken: session.accessToken, payload };
}

function signedOutResponse(): Response {
  return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
}

function isExistingAccount(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const failure = payload as { error?: unknown; detail?: unknown };
  return [failure.error, failure.detail]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLowerCase().includes("already registered"));
}

export async function GET(_request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params;
  if (action !== "session") return Response.json({ error: "not_found" }, { status: 404 });
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) accessToken = (await refreshSession())?.accessToken;
  if (!accessToken) {
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
    return signedOutResponse();
  }

  let response = await upstream("v1/auth/session", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) response = await upstream("v1/auth/session", {
      method: "GET",
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    });
  }
  if (response.status === 401) {
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
    return signedOutResponse();
  }
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params;
  const store = await cookies();
  if (action === "sign-out") {
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
    return Response.json({ signedOut: true });
  }
  if (action !== "sign-in" && action !== "sign-up") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = await request.text();
  let response = await upstream(`v1/auth/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  let payload = await response.json().catch(() => null);

  // Demo sign-up can be submitted twice by fast clicks or a retry after a
  // successful response was lost. Treat the known duplicate-account result as
  // an idempotent sign-in with the same credentials instead of surfacing a 400.
  if (action === "sign-up" && response.status === 400 && isExistingAccount(payload)) {
    response = await upstream("v1/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    payload = await response.json().catch(() => null);
  }

  if (response.ok && payload && typeof payload === "object" && "session" in payload) {
    await storeSession(payload);
  }
  const publicPayload = payload && typeof payload === "object" && "session" in payload
    ? { user: (payload as { session: { user: unknown } }).session.user, confirmationRequired: false }
    : payload;
  return Response.json(publicPayload, { status: response.status });
}
