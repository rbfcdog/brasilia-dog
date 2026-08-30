import { apiFetch } from "@/lib/api";
import type {
  AgentResponse,
  Mandate,
  PublicAgentRun,
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

  startRun(goal: string, mandate: Mandate, conversationId?: string) {
    if (!mandate.marketplaceScope) throw new Error("The agent did not return a structured marketplace scope.");
    return apiFetch<Pick<PublicAgentRun, "runId" | "status">>("/api/agent-runs", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        goal,
        ...(conversationId ? { conversationId } : {}),
        proposal: {
          scope: mandate.marketplaceScope,
          maximumAmount: mandate.maximumAmount,
          currency: "usd",
        },
      }),
    });
  },

  getRun(runId: string) {
    return apiFetch<PublicAgentRun>(`/api/agent-runs/${encodeURIComponent(runId)}`);
  },

  listRuns() {
    return apiFetch<{ runs: PublicAgentRun[] }>("/api/agent-runs");
  },

  resumeRun(runId: string) {
    return apiFetch<Pick<PublicAgentRun, "runId" | "status">>(`/api/agent-runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  },
};
