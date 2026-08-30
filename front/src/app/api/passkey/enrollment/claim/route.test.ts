import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/passkey/enrollment/claim/route";

describe("passkey enrollment QR claim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BACKEND_API_URL;
  });

  it("stores the user-bound grant in an HttpOnly cookie and removes it from the URL", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      valid: true,
      expiresAt: "2026-08-30T02:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await GET(new Request("https://shop.example.test/api/passkey/enrollment/claim?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://shop.example.test/passkey/enroll");
    expect(response.headers.get("set-cookie")).toContain("nomad-passkey-enrollment=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")?.toLowerCase()).toContain("samesite=strict");
    expect(response.headers.get("set-cookie")).toContain("Path=/api/backend/passkey/register");
    expect(response.headers.get("location")).not.toContain("token=");
  });

  it("does not set a cookie for an expired grant", async () => {
    process.env.BACKEND_API_URL = "https://api.example.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "expired" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));

    const response = await GET(new Request("https://shop.example.test/api/passkey/enrollment/claim?token=expired-token-value-that-is-long-enough"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/passkey/enroll?error=expired");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
