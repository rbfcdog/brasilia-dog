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

    const executionPromise = executeMockPurchase(analysis.mandate.id, analysis.mandate.mockOutcome);
    await vi.advanceTimersByTimeAsync(1_150);
    await expect(executionPromise).resolves.toMatchObject({
      kind: "scheduled",
      scheduledPurchase: { maximumAmount: 220, status: "searching" },
    });
  });
});
