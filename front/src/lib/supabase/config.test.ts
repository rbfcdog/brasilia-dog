import { afterEach, describe, expect, it, vi } from "vitest";
import { isMerchantMockMode } from "@/lib/supabase/config";

describe("merchant mock-mode configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to enabled during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_MOCK_AUTH", "");

    expect(isMerchantMockMode()).toBe(true);
  });

  it("can be enabled explicitly for a deployed hackathon demo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_MOCK_AUTH", "true");

    expect(isMerchantMockMode()).toBe(true);
  });

  it("stays disabled in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_MOCK_AUTH", "");

    expect(isMerchantMockMode()).toBe(false);
  });

  it("can be disabled explicitly while developing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MERCHANT_MOCK_AUTH", "false");

    expect(isMerchantMockMode()).toBe(false);
  });
});
