import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMockRequest, executeMockPurchase } from "@/mocks/shopping";
import type { ChatMessage } from "@/types/shopping";

describe("mock shopping engine", () => {
  afterEach(() => vi.useRealTimers());

  it("asks for missing monitor specifications", async () => {
    vi.useFakeTimers();
    const resultPromise = analyzeMockRequest("Find me a monitor", []);
    await vi.advanceTimersByTimeAsync(850);

    await expect(resultPromise).resolves.toMatchObject({
      kind: "clarification",
      message: expect.stringContaining("minimum screen size"),
    });
  });

  it("creates an immediate mandate for the $300 demo prompt", async () => {
    vi.useFakeTimers();
    const resultPromise = analyzeMockRequest("Buy an ultrawide monitor up to $300", []);
    await vi.advanceTimersByTimeAsync(850);
    const result = await resultPromise;

    expect(result.kind).toBe("mandate");
    if (result.kind === "mandate") {
      expect(result.mandate.maximumAmount).toBe(300);
      expect(result.mandate.mockOutcome).toBe("immediate");
      expect(result.mandate.minimumScreenSize).toBe(34);
    }
  });

  it("turns a clarified answer into a mandate", async () => {
    vi.useFakeTimers();
    const context: ChatMessage[] = [
      { id: "1", role: "user", content: "Find me a monitor", createdAt: "2026-08-29T00:00:00Z" },
      { id: "2", role: "assistant", content: "What is the minimum screen size you are looking for?", createdAt: "2026-08-29T00:00:01Z" },
    ];
    const resultPromise = analyzeMockRequest("At least 34 inches, up to $300", context);
    await vi.advanceTimersByTimeAsync(850);
    await expect(resultPromise).resolves.toMatchObject({
      kind: "mandate",
      mandate: { maximumAmount: 300, minimumScreenSize: 34 },
    });
  });

  it("schedules a purchase when the deterministic budget is too low", async () => {
    vi.useFakeTimers();
    const analysisPromise = analyzeMockRequest("Track a 34-inch ultrawide monitor under $220", []);
    await vi.advanceTimersByTimeAsync(850);
    const analysis = await analysisPromise;
    expect(analysis.kind).toBe("mandate");
    if (analysis.kind !== "mandate") return;

    const executionPromise = executeMockPurchase(
      { ...analysis.mandate, paymentMethodId: "payment-visa-4242" },
      { id: "payment-visa-4242", brand: "Visa", label: "Personal Visa", last4: "4242", expiry: "08/29" },
    );
    await vi.advanceTimersByTimeAsync(1_150);
    await expect(executionPromise).resolves.toMatchObject({
      kind: "scheduled",
      scheduledPurchase: {
        maximumAmount: 220,
        validityHours: 72,
        paymentMethod: { last4: "4242" },
        status: "searching",
      },
    });
  });

  it("automatically selects a qualifying appliance only after the search mandate is approved", async () => {
    vi.useFakeTimers();
    const executionPromise = executeMockPurchase(
      {
        id: "mandate-appliances",
        scope: "Household appliances around $100",
        maximumAmount: 100,
        currency: "USD",
        validUntil: "2026-09-02T00:00:00Z",
        validityHours: 72,
        paymentMethodId: "payment-visa-4242",
        status: "active",
        mockOutcome: "immediate",
      },
      { id: "payment-visa-4242", brand: "Visa", label: "Personal Visa", last4: "4242", expiry: "08/29" },
    );
    await vi.advanceTimersByTimeAsync(1_150);

    await expect(executionPromise).resolves.toMatchObject({
      kind: "purchased",
      receipt: {
        item: "Temperature-control electric kettle",
        total: 69,
      },
      listings: [
        { item: "Temperature-control electric kettle", qualifies: true, selected: true },
        { item: "Compact countertop blender", qualifies: true, selected: false },
        { item: "Two-slice digital toaster", qualifies: false, selected: false },
      ],
    });
  });
});
