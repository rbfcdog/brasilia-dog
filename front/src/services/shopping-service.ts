import { apiFetch } from "@/lib/api";
import type {
  AgentResponse,
  ChatMessage,
  Mandate,
  PurchaseResponse,
} from "@/types/shopping";

export const shoppingService = {
  analyze(message: string, conversationContext: ChatMessage[]) {
    return apiFetch<AgentResponse>("/api/agent", {
      method: "POST",
      body: JSON.stringify({ message, conversationContext }),
    });
  },

  execute(mandate: Mandate) {
    return apiFetch<PurchaseResponse>("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        mandateId: mandate.id,
        mockOutcome: mandate.mockOutcome,
      }),
    });
  },
};
