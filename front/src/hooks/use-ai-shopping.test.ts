import { describe, expect, it } from "vitest";
import {
  aiShoppingReducer,
  initialAIShoppingState,
} from "@/hooks/use-ai-shopping";

const userMessage = {
  id: "user-1",
  role: "user" as const,
  content: "Buy an ultrawide monitor up to $300",
  createdAt: "2026-08-29T00:00:00Z",
};

describe("AI shopping state machine", () => {
  it("moves from idle to analysis and clarification", () => {
    const analyzing = aiShoppingReducer(
      { ...initialAIShoppingState, hydrated: true },
      { type: "SUBMIT", message: userMessage },
    );
    expect(analyzing.status).toBe("analyzing");

    const clarified = aiShoppingReducer(analyzing, {
      type: "CLARIFICATION",
      message: { ...userMessage, id: "assistant-1", role: "assistant", content: "What size?" },
    });
    expect(clarified.status).toBe("clarification");
    expect(clarified.messages).toHaveLength(2);
  });

  it("resets all transient purchase state without losing hydration", () => {
    const reset = aiShoppingReducer(
      { ...initialAIShoppingState, hydrated: true, status: "error", error: "Failed", messages: [userMessage] },
      { type: "RESET" },
    );
    expect(reset).toMatchObject({ status: "idle", messages: [], error: null, hydrated: true });
  });
});
