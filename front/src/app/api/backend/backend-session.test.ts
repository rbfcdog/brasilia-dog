import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => {
    const value = mocks.cookies.get(name);
    return value ? { value } : undefined;
  } }),
}));

import { GET, POST } from "@/app/api/backend/[...path]/route";

describe("passkey BFF session continuity", () => {
  afterEach(() => {
    mocks.cookies.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BACKEND_API_URL;
  });

  it("stores a verified passkey session in an HttpOnly BFF cookie", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    mocks.cookies.set("nomad-auth-access", "account-token");
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      verified: true,
      sessionToken: "passkey-session",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mocks.fetch);

    const response = await POST(new Request("https://shop.example.test/api/backend/passkey/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: {} }),
    }), { params: Promise.resolve({ path: ["passkey", "auth", "verify"] }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("nomad-passkey-session=passkey-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("nomad-passkey-authenticated=1");
  });

  it("forwards the BFF passkey cookie to conversation routes", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    mocks.cookies.set("nomad-passkey-session", "cookie-session");
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ conversations: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", mocks.fetch);

    await GET(new Request("https://shop.example.test/api/backend/v1/conversations"), {
      params: Promise.resolve({ path: ["v1", "conversations"] }),
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL("https://api.example.test/v1/conversations"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).get("authorization")).toBe("Bearer cookie-session");
  });

  it("proxies buyer chat through the API with the passkey session", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    mocks.cookies.set("nomad-passkey-session", "cookie-session");
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { kind: "clarification", message: "What is your budget?" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mocks.fetch);

    const response = await POST(new Request("https://shop.example.test/api/backend/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Show me monitors" }),
    }), { params: Promise.resolve({ path: ["v1", "chat"] }) });

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL("https://api.example.test/v1/chat"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).get("authorization")).toBe("Bearer cookie-session");
  });

  it("keeps the browser's passkey bearer for chat when an account cookie is also present", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    mocks.cookies.set("nomad-auth-access", "account-token");
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { kind: "clarification", message: "What is your budget?" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mocks.fetch);

    await POST(new Request("https://shop.example.test/api/backend/v1/chat", {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-passkey-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Show me appliances" }),
    }), { params: Promise.resolve({ path: ["v1", "chat"] }) });

    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).get("authorization")).toBe("Bearer browser-passkey-session");
  });
});
