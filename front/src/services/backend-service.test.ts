import { describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));

import { backendService } from "@/services/backend-service";

describe("backend conversation client", () => {
  it("uses the authenticated backend proxy for a persisted transcript", async () => {
    apiFetch
      .mockResolvedValueOnce({ conversation: { id: "conversation-1" } })
      .mockResolvedValueOnce({ message: { id: "message-1" } })
      .mockResolvedValueOnce({ event: { id: "event-1" } })
      .mockResolvedValueOnce({ messages: [] });

    await backendService.createConversation();
    await backendService.appendConversationMessage("conversation-1", {
      role: "user",
      content: "Buy an ultrawide monitor up to $300",
      createdAt: "2026-08-29T00:00:00.000Z",
    });
    await backendService.appendConversationEvent("conversation-1", {
      type: "catalog_search",
      payload: { query: "ultrawide monitor", resultSlugs: ["aster-34-uwqhd"] },
      createdAt: "2026-08-29T00:00:01.000Z",
    });
    await backendService.conversationMessages("conversation-1");

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/backend/v1/conversations", { method: "POST" });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/backend/v1/conversations/conversation-1/messages", {
      method: "POST",
      body: JSON.stringify({
        role: "user",
        content: "Buy an ultrawide monitor up to $300",
        createdAt: "2026-08-29T00:00:00.000Z",
      }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/api/backend/v1/conversations/conversation-1/events", {
      method: "POST",
      body: JSON.stringify({
        type: "catalog_search",
        payload: { query: "ultrawide monitor", resultSlugs: ["aster-34-uwqhd"] },
        createdAt: "2026-08-29T00:00:01.000Z",
      }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(4, "/api/backend/v1/conversations/conversation-1/messages");
  });
});
