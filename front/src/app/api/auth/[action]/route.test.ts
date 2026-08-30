import { afterEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), set: cookieSet, delete: vi.fn() }),
}));

import { POST } from "@/app/api/auth/[action]/route";

describe("authentication BFF", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cookieSet.mockClear();
    delete process.env.BACKEND_API_URL;
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
    expect(cookieSet).toHaveBeenCalledWith("vero-auth-access", "access-secret", expect.objectContaining({ httpOnly: true }));
    expect(cookieSet).toHaveBeenCalledWith("vero-auth-refresh", "refresh-secret", expect.objectContaining({ httpOnly: true }));
  });
});
