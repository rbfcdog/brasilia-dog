import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAccessToken: vi.fn().mockResolvedValue(null),
}));

import {
  apiFetch,
  InvalidJsonResponseError,
  PaymentChallengeError,
} from "@/lib/api";

describe("apiFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("unwraps JSON success responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true, data: { value: 42 } }),
    );
    await expect(apiFetch<{ value: number }>("/test")).resolves.toEqual({ value: 42 });
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
});
