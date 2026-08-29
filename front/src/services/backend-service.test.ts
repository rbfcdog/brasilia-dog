import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
import { backendService } from "@/services/backend-service";

const mockedApiFetch = vi.mocked(apiFetch);

describe("backendService", () => {
  beforeEach(() => mockedApiFetch.mockReset());

  it("uses the local backend proxy for health checks", async () => {
    mockedApiFetch.mockResolvedValue({ status: "ok" });

    await expect(backendService.health()).resolves.toEqual({ status: "ok" });
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/backend/health");
  });

  it("keeps product slugs within one proxied path segment", async () => {
    mockedApiFetch.mockResolvedValue({ product: {} });

    await backendService.productInfo("market/signal");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/backend/v1/products/market%2Fsignal/info",
    );
  });
});
