import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getRuns, POST as startRun } from "@/app/api/agent-runs/route";
import { GET as getRun } from "@/app/api/agent-runs/[runId]/route";
import { POST as resumeRun } from "@/app/api/agent-runs/[runId]/resume/route";

const ownerId = "9748cc53-e6bd-440d-b26f-85be9b816c50";
const otherOwnerId = "1155d63d-9604-46a4-b8f1-2915488c6ad9";
const runId = "0f09f35e-e3f1-4a49-99a0-7866cd98ed7c";
const mandateId = "e58ca290-608a-46d7-9738-3a23c409856f";
const identityId = "bf10bb5a-2c1c-48f5-a322-1df37c5c842c";
const signingKeyId = "425db812-2965-42c3-a30d-d91a2916e04d";
const extensionId = "b81cc26f-e3cc-4c6e-8255-fe4514e0c72d";
const idempotencyKey = "514dc8ef-f6b4-455b-9ad4-12bc2a600444";

const cookieMock = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieMock.values[name] ? { value: cookieMock.values[name]! } : undefined),
  }),
}));

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function session(issuedAt = Date.now()): Response {
  return json({ valid: true, userId: ownerId, issuedAt, expiresAt: issuedAt + 600_000 });
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer passkey-session");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

function context(id = runId) {
  return { params: Promise.resolve({ runId: id }) };
}

const proposal = {
  scope: {
    query: "34-inch ultrawide monitor",
    category: "electronics",
    constraints: [{ field: "screen_size_inches", operator: "gte", value: 34 }],
    searchWindowSeconds: 60,
  },
  maximumAmount: 300,
  currency: "usd",
};

describe("agent-run BFF authority boundary", () => {
  beforeEach(() => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    process.env.AGENT_SERVICE_URL = "https://agent.example.test";
    process.env.AGENT_SERVICE_TOKEN = "server-only-agent-token";
    vi.clearAllMocks();
    cookieMock.values = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BACKEND_API_URL;
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.AGENT_SERVICE_TOKEN;
  });
  it("requires a passkey session before starting a run", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await startRun(new Request("http://localhost/api/agent-runs", {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey },
    }));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("accepts the browser passkey-session cookie set by the backend proxy", async () => {
    cookieMock.values = { "vero-passkey-session": "cookie-session" };
    const publicKeyJwk = { kty: "OKP", crv: "Ed25519", x: "public-key-x" };
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { algorithm: "Ed25519", publicKeyJwk, fingerprint: "fingerprint" } }))
      .mockResolvedValueOnce(json({ identity: { id: identityId }, signingKey: { id: signingKeyId } }))
      .mockResolvedValueOnce(json({ mandate: { id: mandateId } }))
      .mockResolvedValueOnce(json({ ok: true, data: { runId, status: "queued" } }));
    vi.stubGlobal("fetch", upstream);

    const response = await startRun(new Request("http://localhost/api/agent-runs", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Buy a monitor", proposal }),
    }));

    expect(response.status).toBe(202);
    const verifyCall = upstream.mock.calls[0]!;
    expect(JSON.parse(String(verifyCall[1].body))).toEqual({ sessionToken: "cookie-session" });
  });

  it("rejects a missing or malformed idempotency key", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const response = await startRun(request("/api/agent-runs", { method: "POST" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_KEY_INVALID" } });
  });

  it("rejects proposals with more than eight simple constraints", async () => {
    const upstream = vi.fn().mockResolvedValue(session());
    vi.stubGlobal("fetch", upstream);
    const response = await startRun(request("/api/agent-runs", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Buy a monitor", proposal: {
        ...proposal,
        scope: { ...proposal.scope, constraints: Array.from({ length: 9 }, (_, index) => ({ field: `field_${index}`, operator: "eq", value: true })) },
      } }),
    }));
    expect(response.status).toBe(422);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("ensures one identity, creates one mandate and starts one run with the same key", async () => {
    const publicKeyJwk = { kty: "OKP", crv: "Ed25519", x: "public-key-x" };
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { algorithm: "Ed25519", publicKeyJwk, fingerprint: "fingerprint" } }))
      .mockResolvedValueOnce(json({ identity: { id: identityId }, signingKey: { id: signingKeyId } }))
      .mockResolvedValueOnce(json({ mandate: { id: mandateId } }))
      .mockResolvedValueOnce(json({ ok: true, data: { runId, status: "queued" } }));
    vi.stubGlobal("fetch", upstream);

    const response = await startRun(request("/api/agent-runs", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey, "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Buy a monitor", conversationId: "conversation-real", proposal }),
    }));

    expect(response.status).toBe(202);
    expect(upstream).toHaveBeenCalledTimes(5);
    const mandateCall = upstream.mock.calls[3]!;
    expect(String(mandateCall[0])).toBe("https://api.example.test/v1/mandates");
    expect(new Headers(mandateCall[1].headers).get("Idempotency-Key")).toBe(idempotencyKey);
    expect(JSON.parse(String(mandateCall[1].body))).toMatchObject({
      agentIdentityId: identityId,
      maxAmountMinor: 30000,
      currency: "usd",
      scope: proposal.scope,
    });
    const agentCall = upstream.mock.calls[4]!;
    expect(new Headers(agentCall[1].headers).get("Idempotency-Key")).toBe(idempotencyKey);
    expect(JSON.parse(String(agentCall[1].body))).toMatchObject({
      ownerId, mandateId, agentIdentityId: identityId, agentSigningKeyId: signingKeyId,
    });
  });

  it("returns a run owned by the authenticated session", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runId, ownerId, status: "monitoring" } })));
    const response = await getRun(request(`/api/agent-runs/${runId}`), context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { runId, status: "monitoring" } });
  });

  it("hides a run owned by another user", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runId, ownerId: otherOwnerId, status: "monitoring" } })));
    const response = await getRun(request(`/api/agent-runs/${runId}`), context());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "RUN_NOT_FOUND" } });
  });

  it("lists runs using only the verified owner ID", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runs: [{ runId, ownerId, status: "monitoring" }] } }));
    vi.stubGlobal("fetch", upstream);
    const response = await getRuns(request("/api/agent-runs"));
    expect(response.status).toBe(200);
    expect(String(upstream.mock.calls[1]![0])).toContain(`ownerId=${ownerId}`);
  });

  it("treats a stale passive run-list session as an empty demo state", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await getRuns(new Request("http://localhost/api/agent-runs"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { runs: [] } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("requires a fresh passkey assertion before resume", async () => {
    const upstream = vi.fn().mockResolvedValue(session(Date.now() - 121_000));
    vi.stubGlobal("fetch", upstream);
    const response = await resumeRun(request(`/api/agent-runs/${runId}/resume`, {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey },
    }), context());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FRESH_PASSKEY_REQUIRED" } });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("does not extend a run owned by another user", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runId, ownerId: otherOwnerId, mandateId, status: "waiting_for_extension" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await resumeRun(request(`/api/agent-runs/${runId}/resume`, {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey },
    }), context());
    expect(response.status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("extends the same mandate and forwards the extension ID to the same run", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runId, ownerId, mandateId, status: "waiting_for_extension" } }))
      .mockResolvedValueOnce(json({ extension: { extensionId, mandateId, version: 2 } }))
      .mockResolvedValueOnce(json({ ok: true, data: { runId, status: "queued" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await resumeRun(request(`/api/agent-runs/${runId}/resume`, {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey },
    }), context());
    expect(response.status).toBe(202);
    expect(String(upstream.mock.calls[2]![0])).toBe(`https://api.example.test/v1/mandates/${mandateId}/extend`);
    expect(JSON.parse(String(upstream.mock.calls[2]![1].body))).toEqual({ runId });
    expect(JSON.parse(String(upstream.mock.calls[3]![1].body))).toEqual({ extensionId });
    expect(new Headers(upstream.mock.calls[3]![1].headers).get("Idempotency-Key")).toBe(idempotencyKey);
  });

  it("propagates an upstream extension conflict without resuming the agent", async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ ok: true, data: { runId, ownerId, mandateId, status: "waiting_for_extension" } }))
      .mockResolvedValueOnce(json({ error: "mandate_extension_failed", detail: "The key belongs to another run." }, 409));
    vi.stubGlobal("fetch", upstream);
    const response = await resumeRun(request(`/api/agent-runs/${runId}/resume`, {
      method: "POST", headers: { "Idempotency-Key": idempotencyKey },
    }), context());
    expect(response.status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(3);
  });
});
