import { cookies } from "next/headers";

// Keep the current cookie name first; accept the legacy name while existing
// authenticated browser sessions age out.
const PASSKEY_SESSION_COOKIES = ["vero-passkey-session", "nomad-passkey-session"] as const;

// Must match MANDATE_VALIDITY_MS in agent/src/chat.ts: the authority granted here has to
// be the same window the user saw and approved on the mandate card.
export const MANDATE_VALIDITY_MS = 72 * 60 * 60 * 1_000;

export interface VerifiedOwnerSession {
  token: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface MarketplaceProposal {
  scope: {
    query: string;
    category: string;
    constraints: Array<{ field: string; operator: "eq" | "gte" | "lte"; value: string | number | boolean }>;
    searchWindowSeconds: 60;
  };
  maximumAmount: number;
  currency: "usd";
}

export class BffError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

function configuredUrl(name: "BACKEND_API_URL" | "AGENT_SERVICE_URL", path: string): URL {
  const value = process.env[name]?.trim();
  if (!value) throw new BffError("BACKEND_UNAVAILABLE", `${name} is not configured.`, 503);
  return new URL(path, value.endsWith("/") ? value : `${value}/`);
}

async function responseError(response: Response): Promise<BffError> {
  const body = await response.json().catch(() => null) as {
    error?: string | { code?: string; message?: string };
    detail?: string;
  } | null;
  const nested = typeof body?.error === "object" ? body.error : null;
  const code = nested?.code ?? (typeof body?.error === "string" ? body.error : "UPSTREAM_ERROR");
  const message = body?.detail ?? nested?.message ?? `Upstream request failed with status ${response.status}.`;
  return new BffError(code, message, response.status);
}

export function bffError(error: unknown): Response {
  const failure = error instanceof BffError
    ? error
    : new BffError("AGENT_RUN_FAILED", error instanceof Error ? error.message : "Agent run request failed.", 500);
  return Response.json({ ok: false, error: { code: failure.code, message: failure.message } }, { status: failure.status });
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key");
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BffError("IDEMPOTENCY_KEY_INVALID", "Idempotency-Key must be a UUID.", 400);
  }
  return value.toLowerCase();
}

async function passkeySessionToken(request: Request): Promise<string | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]?.trim();
  if (bearer) return bearer;
  // The browser client never attaches Authorization headers (see lib/api.ts), so the
  // HttpOnly passkey cookie is the carrier for a signed-in session, exactly as in the
  // /api/backend proxy.
  try {
    const store = await cookies();
    for (const name of PASSKEY_SESSION_COOKIES) {
      const token = store.get(name)?.value?.trim();
      if (token) return token;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyOwnerSession(request: Request, fresh = false): Promise<VerifiedOwnerSession> {
  const token = await passkeySessionToken(request);
  if (!token) throw new BffError("AUTHENTICATION_REQUIRED", "A passkey session is required.", 401);
  const response = await fetch(configuredUrl("BACKEND_API_URL", "passkey/session/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken: token }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw await responseError(response);
  const session = await response.json() as Omit<VerifiedOwnerSession, "token">;
  if (fresh && Date.now() - session.issuedAt > 120_000) {
    throw new BffError("FRESH_PASSKEY_REQUIRED", "Authenticate with the passkey again to approve this action.", 401);
  }
  return { token, ...session };
}

export async function backend<T>(path: string, sessionToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${sessionToken}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(configuredUrl("BACKEND_API_URL", path.replace(/^\//, "")), {
    ...init, headers, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export async function agent<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.AGENT_SERVICE_TOKEN?.trim();
  if (!token) throw new BffError("AGENT_UNAVAILABLE", "AGENT_SERVICE_TOKEN is not configured.", 503);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(configuredUrl("AGENT_SERVICE_URL", path.replace(/^\//, "")), {
    ...init, headers, cache: "no-store", signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw await responseError(response);
  const envelope = await response.json() as { ok?: boolean; data?: T };
  if (envelope.ok !== true || envelope.data === undefined) throw new BffError("INVALID_AGENT_RESPONSE", "The agent response is invalid.", 502);
  return envelope.data;
}

export function parseProposal(value: unknown): MarketplaceProposal {
  if (!value || typeof value !== "object") throw new BffError("INVALID_PROPOSAL", "A structured marketplace proposal is required.", 422);
  const proposal = value as Record<string, unknown>;
  const scope = proposal.scope as Record<string, unknown> | null;
  const constraints = scope?.constraints;
  if (!scope || typeof scope.query !== "string" || !scope.query.trim() || typeof scope.category !== "string" || !scope.category.trim()
    || scope.searchWindowSeconds !== 60 || !Array.isArray(constraints) || constraints.length > 8
    || !constraints.every((item) => {
      if (!item || typeof item !== "object") return false;
      const constraint = item as Record<string, unknown>;
      return typeof constraint.field === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(constraint.field)
        && (constraint.operator === "eq" || constraint.operator === "gte" || constraint.operator === "lte")
        && ["string", "number", "boolean"].includes(typeof constraint.value)
        && ((constraint.operator === "eq") || typeof constraint.value === "number");
    })
    || typeof proposal.maximumAmount !== "number" || !Number.isFinite(proposal.maximumAmount)
    || proposal.maximumAmount <= 0 || proposal.maximumAmount > 100_000 || proposal.currency !== "usd") {
    throw new BffError("INVALID_PROPOSAL", "The structured marketplace proposal is invalid.", 422);
  }
  return {
    scope: {
      query: scope.query.trim(), category: scope.category.trim(),
      constraints: constraints as MarketplaceProposal["scope"]["constraints"], searchWindowSeconds: 60,
    },
    maximumAmount: proposal.maximumAmount, currency: "usd",
  };
}

const SANDBOX_PRODUCT = {
  id: "demo-product-1",
  slug: "ultrawide-monitor-buying-guide",
  name: "Ultrawide monitor buying guide",
  description: "Current comparison data for ultrawide monitors, panels, ports, and ergonomics.",
  metadata: { category: "electronics", source: "sandbox" },
  merchant: { id: "vero-sandbox-merchant", businessName: "Vero Sandbox Merchant", status: "active" },
  offering: { id: "demo-offering-1", amountMinor: 250, currency: "usd", scale: 2, active: true },
};

export function normalizeAgentRun(run: Record<string, unknown>): Record<string, unknown> {
  const sandbox = typeof run.mandateId === "string" && run.mandateId.startsWith("sandbox-mandate-");
  const result = run.result && typeof run.result === "object"
    ? run.result as Record<string, unknown>
    : null;
  const receipt = result?.receipt && typeof result.receipt === "object"
    ? result.receipt as Record<string, unknown>
    : null;
  const completed = sandbox && run.status === "completed" && result?.outcome === "allowed";

  return {
    ...run,
    candidates: Array.isArray(run.candidates) ? run.candidates : sandbox ? [SANDBOX_PRODUCT] : [],
    authorityChecks: Array.isArray(run.authorityChecks) ? run.authorityChecks : sandbox ? [{
      name: "Sandbox mandate and fixed price verified",
      passed: true,
      checkedAt: typeof run.updatedAt === "string" ? run.updatedAt : new Date().toISOString(),
    }] : [],
    ...(sandbox ? { selectedProduct: SANDBOX_PRODUCT } : {}),
    ...(completed ? {
      proofId: `sandbox-proof-${run.runId}`,
      paymentAttempt: {
        id: result?.attemptId,
        status: "settled",
        amountMinor: receipt?.amountMinor,
        currency: receipt?.currency,
        scale: 2,
        providerPaymentId: `sandbox-payment-${run.runId}`,
        agentExecutionProofId: `sandbox-proof-${run.runId}`,
        receipt,
      },
      receipt: {
        method: "stripe_mpp_sandbox",
        reference: receipt?.reference,
        status: "success",
        timestamp: typeof run.updatedAt === "string" ? run.updatedAt : new Date().toISOString(),
      },
    } : {}),
  };
}
