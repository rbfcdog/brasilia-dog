import { apiFetch } from "@/lib/api";
import type {
  AgentResponse,
  Mandate,
  PurchaseResponse,
} from "@/types/shopping";

export const shoppingService = {
  analyze(message: string, conversationId?: string) {
    return apiFetch<AgentResponse>("/api/agent", {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(conversationId ? { conversationId } : {}),
      }),
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
