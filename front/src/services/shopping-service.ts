import { apiFetch } from "@/lib/api";
import type {
  AgentResponse,
  Mandate,
  PaymentMethod,
  PurchaseResponse,
} from "@/types/shopping";

export const shoppingService = {
  analyze(message: string, conversationId?: string): Promise<AgentResponse & { conversationId: string }> {
    return apiFetch<AgentResponse & { conversationId: string }>("/api/backend/v1/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        ...(conversationId ? { conversationId } : {}),
      }),
    });
  },


  execute(mandate: Mandate, paymentMethod: PaymentMethod) {
    return apiFetch<PurchaseResponse>("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        mandate,
        paymentMethod,
      }),
    });
  },
};
