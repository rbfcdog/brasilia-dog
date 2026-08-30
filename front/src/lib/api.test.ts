import { afterEach, describe, expect, it, vi } from "vitest";


import {
  apiFetch,
  InvalidJsonResponseError,
  PaymentChallengeError,
} from "@/lib/api";
import {
  clearPasskeySessionToken,
  getPasskeySessionToken,
  storePasskeySessionToken,
} from "@/lib/passkey-session";

describe("apiFetch", () => {
  afterEach(() => {
    clearPasskeySessionToken();
    vi.restoreAllMocks();
  });

  it("unwraps JSON success responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true, data: { value: 42 } }),
    );
    await expect(apiFetch<{ value: number }>("/test")).resolves.toEqual({ value: 42 });
  });

  it("returns raw backend JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ status: "ok" }),
    );
    await expect(apiFetch<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
  });

  it("intercepts Payment 402 challenges", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { ok: false, error: { code: "PAYMENT_REQUIRED", message: "Required" } },
        { status: 402, headers: { "WWW-Authenticate": "Payment method=stripe" } },
      ),
    );
    await expect(apiFetch("/paid")).rejects.toBeInstanceOf(PaymentChallengeError);
  });

  it("rejects non-JSON service responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service unavailable", { status: 503, headers: { "content-type": "text/plain" } }),
    );
    await expect(apiFetch("/test")).rejects.toBeInstanceOf(InvalidJsonResponseError);
  });

  it("preserves a passkey session when an unrelated request is unauthorized", async () => {
    storePasskeySessionToken("passkey-session");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "agent_authentication_required" }, { status: 401 }),
    );

    await expect(apiFetch("/api/backend/v1/conversations/example/messages")).rejects.toThrow(
      "agent_authentication_required",
    );
    expect(getPasskeySessionToken()).toBe("passkey-session");
  });
});
