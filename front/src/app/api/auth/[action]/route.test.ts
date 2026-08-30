import { afterEach, describe, expect, it, vi } from "vitest";

const cookieMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieMocks,
}));

import { GET, POST } from "@/app/api/auth/[action]/route";

describe("authentication BFF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.BACKEND_API_URL;
  });

  it("treats a missing browser session as a successful signed-out state", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/auth/session"), {
      params: Promise.resolve({ action: "session" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ user: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores API auth tokens in HttpOnly cookies and never returns them to browser code", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: {
        user: { id: "user-1", email: "buyer@example.com" },
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresAt: 2_000_000_000,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await POST(new Request("http://localhost/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email: "buyer@example.com", password: "password123" }),
    }), { params: Promise.resolve({ action: "sign-in" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-1", email: "buyer@example.com" },
      confirmationRequired: false,
    });
    expect(cookieMocks.set).toHaveBeenCalledWith("vero-auth-access", "access-secret", expect.objectContaining({ httpOnly: true }));
    expect(cookieMocks.set).toHaveBeenCalledWith("vero-auth-refresh", "refresh-secret", expect.objectContaining({ httpOnly: true }));
  });

  it("turns a duplicate sign-up retry into a signed-in session", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "signup_failed",
        detail: "User already registered",
      }), { status: 400, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        session: {
          user: { id: "user-1", email: "buyer@example.com" },
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
          expiresAt: 2_000_000_000,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({
      email: "buyer@example.com",
      password: "password123",
      cpf: "52998224725",
      role: "buyer",
    });

    const response = await POST(new Request("http://localhost/api/auth/sign-up", {
      method: "POST",
      body,
    }), { params: Promise.resolve({ action: "sign-up" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-1", email: "buyer@example.com" },
      confirmationRequired: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe("https://api.example.test/v1/auth/sign-in");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: "POST", body }));
    expect(cookieMocks.set).toHaveBeenCalledWith("vero-auth-access", "access-secret", expect.objectContaining({ httpOnly: true }));
  });
});
