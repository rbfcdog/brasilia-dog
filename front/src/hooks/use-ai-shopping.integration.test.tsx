import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPasskeySessionToken: vi.fn(),
  listConversations: vi.fn(),
  conversationMessages: vi.fn(),
  createConversation: vi.fn(),
  appendConversationMessage: vi.fn(),
  appendConversationEvent: vi.fn(),
  analyze: vi.fn(),
  execute: vi.fn(),
  addScheduledPurchase: vi.fn(),
  readMessages: vi.fn(),
  writeMessages: vi.fn(),
  clearMessages: vi.fn(),
}));

vi.mock("@/lib/passkey-session", () => ({
  hasAccountSession: () => Boolean(mocks.getPasskeySessionToken()),
  hasPasskeySession: () => Boolean(mocks.getPasskeySessionToken()),
  getPasskeySessionToken: mocks.getPasskeySessionToken,
}));
vi.mock("@/services/backend-service", () => ({
  backendService: {
    listConversations: mocks.listConversations,
    conversationMessages: mocks.conversationMessages,
    createConversation: mocks.createConversation,
    appendConversationMessage: mocks.appendConversationMessage,
    appendConversationEvent: mocks.appendConversationEvent,
  },
}));
vi.mock("@/services/shopping-service", () => ({
  shoppingService: {
    analyze: mocks.analyze,
    execute: mocks.execute,
  },
}));
vi.mock("@/lib/demo-storage", () => ({
  demoStorage: {
    readMessages: mocks.readMessages,
    writeMessages: mocks.writeMessages,
    clearMessages: mocks.clearMessages,
  },
}));
vi.mock("@/components/providers/shopping-provider", () => ({
  useShoppingStore: () => ({ addScheduledPurchase: mocks.addScheduledPurchase, paymentMethods: [], preferredPaymentMethodId: "" }),
}));
vi.mock("@/services/biometric-provider", () => ({
  passkeyBiometricProvider: { approve: vi.fn() },
}));

import { useAIShopping } from "@/hooks/use-ai-shopping";

describe("live agent chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    mocks.appendConversationMessage.mockResolvedValue({});
    mocks.appendConversationEvent.mockResolvedValue({});
    mocks.createConversation.mockResolvedValue({ conversation: { id: "conversation-created" } });
  });

  it("routes authenticated chat through the backend gateway and adopts its conversation ID", async () => {
    mocks.getPasskeySessionToken.mockReturnValue("passkey-session");
    mocks.listConversations.mockResolvedValue({ conversations: [{ id: "conversation-123" }] });
    mocks.conversationMessages.mockResolvedValue({ messages: [] });
    mocks.analyze.mockResolvedValue({
      kind: "clarification",
      message: "What is your maximum budget?",
      conversationId: "conversation-backend",
    });

    const { result } = renderHook(() => useAIShopping());
    await waitFor(() => expect(result.current.state.hydrated).toBe(true));

    await act(async () => {
      await result.current.sendMessage("I need a monitor.");
    });

    expect(mocks.analyze).toHaveBeenCalledWith("I need a monitor.", "conversation-123");
    expect(result.current.state.status).toBe("clarification");
    expect(result.current.state.messages.at(-1)?.content).toBe("What is your maximum budget?");
    expect(result.current.state.storage).toBe("backend");
  });

  it("routes anonymous chat through the backend gateway with anon owner", async () => {
    mocks.getPasskeySessionToken.mockReturnValue(null);
    mocks.readMessages.mockReturnValue([]);
    mocks.listConversations.mockResolvedValue({ conversations: [] });
    mocks.analyze.mockResolvedValue({
      kind: "clarification",
      message: "Tell me your budget.",
      conversationId: "conversation-anon",
    });

    const { result } = renderHook(() => useAIShopping());
    await waitFor(() => expect(result.current.state.hydrated).toBe(true));

    await act(async () => {
      await result.current.sendMessage("Find appliances");
    });

    expect(mocks.analyze).toHaveBeenCalledWith("Find appliances", undefined);
    expect(result.current.state.storage).toBe("backend");
    expect(result.current.state.messages.at(-1)?.content).toBe("Tell me your budget.");
  });

  it("loads a conversation selected from the recent history controls", async () => {
    mocks.getPasskeySessionToken.mockReturnValue("passkey-session");
    mocks.listConversations.mockResolvedValue({
      conversations: [
        { id: "conversation-newest" },
        { id: "conversation-selected" },
      ],
    });
    mocks.conversationMessages.mockImplementation(async (conversationId: string) => ({
      messages: [{
        id: `message-${conversationId}`,
        conversationId,
        role: "user",
        content: conversationId === "conversation-selected" ? "Selected history" : "Newest history",
        createdAt: "2026-08-30T00:00:00Z",
      }],
    }));
    const { result } = renderHook(() => useAIShopping());
    await waitFor(() => expect(result.current.state.messages[0]?.content).toBe("Newest history"));

    act(() => {
      window.dispatchEvent(new CustomEvent("nomad:open-conversation", {
        detail: { conversationId: "conversation-selected" },
      }));
    });

    await waitFor(() => expect(result.current.state.messages[0]?.content).toBe("Selected history"));
    expect(mocks.conversationMessages).toHaveBeenLastCalledWith("conversation-selected");
  });

  it("creates a new backend conversation through the gateway after reset", async () => {
    mocks.getPasskeySessionToken.mockReturnValue("passkey-session");
    mocks.listConversations.mockResolvedValue({ conversations: [{ id: "conversation-old" }] });
    mocks.conversationMessages.mockResolvedValue({ messages: [] });
    mocks.analyze.mockResolvedValue({
      kind: "clarification",
      message: "What budget?",
      conversationId: "conversation-reset",
    });
    const { result } = renderHook(() => useAIShopping());
    await waitFor(() => expect(result.current.state.hydrated).toBe(true));

    act(() => window.dispatchEvent(new Event("nomad:new-request")));
    await act(async () => {
      await result.current.sendMessage("Find appliances");
    });

    expect(mocks.analyze).toHaveBeenCalledWith("Find appliances", undefined);
    expect(result.current.state.storage).toBe("backend");
  });

  it("surfaces backend gateway failures to the user", async () => {
    mocks.getPasskeySessionToken.mockReturnValue("passkey-session");
    mocks.listConversations.mockResolvedValue({ conversations: [{ id: "conversation-123" }] });
    mocks.conversationMessages.mockResolvedValue({ messages: [] });
    mocks.analyze.mockRejectedValue(new Error("The chat turn could not be committed."));
    const { result } = renderHook(() => useAIShopping());
    await waitFor(() => expect(result.current.state.hydrated).toBe(true));

    await act(async () => {
      await result.current.sendMessage("Find appliances");
    });

    expect(result.current.state.error).toBe("The chat turn could not be committed.");
  });

});
