import { describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import { shoppingService } from "@/services/shopping-service";

describe("shopping agent client", () => {
  it("sends the persisted conversation ID to the live agent BFF", async () => {
    apiFetch.mockResolvedValue({
      kind: "clarification",
      message: "What is your maximum budget?",
    });

    await shoppingService.analyze("I need a monitor.", "conversation-123");

    expect(apiFetch).toHaveBeenCalledWith("/api/agent", {
      method: "POST",
      body: JSON.stringify({
        message: "I need a monitor.",
        conversationId: "conversation-123",
      }),
    });
  });
});
