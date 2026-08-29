import { beforeEach, describe, expect, it } from "vitest";
import { demoStorage } from "@/lib/demo-storage";

describe("versioned demo storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves scheduled mandates across reads", () => {
    const purchase = {
      id: "SCH-1234",
      mandateId: "mandate-1234",
      scope: "34-inch ultrawide monitor",
      maximumAmount: 220,
      currency: "USD" as const,
      createdAt: "2026-08-29T00:00:00Z",
      validUntil: "2026-09-01T00:00:00Z",
      status: "searching" as const,
    };

    demoStorage.writeScheduled([purchase]);
    expect(demoStorage.readScheduled()).toEqual([purchase]);
  });
});
