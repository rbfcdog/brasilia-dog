import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIShoppingState } from "@/hooks/use-ai-shopping";

const mocks = vi.hoisted(() => ({
  requestApproval: vi.fn(),
  resume: vi.fn(),
  state: null as AIShoppingState | null,
}));

vi.mock("@/hooks/use-ai-shopping", () => ({
  useAIShopping: () => ({
    state: mocks.state,
    sendMessage: vi.fn(),
    requestApproval: mocks.requestApproval,
    updateMandate: vi.fn(),
    confirmApproval: vi.fn(),
    cancelApproval: vi.fn(),
    reset: vi.fn(),
    dismissToast: vi.fn(),
    resume: mocks.resume,
  }),
}));

import { ChatExperience } from "@/components/chat/chat-experience";

const mandate = {
  id: "65f8dcea-5333-4f31-93cc-54f3dbb2e72c",
  scope: "34-inch ultrawide monitor",
  maximumAmount: 300,
  currency: "USD" as const,
  minimumScreenSize: 34,
  validUntil: "2026-09-01T00:00:00Z",
  status: "pending" as const,
  marketplaceScope: {
    query: "34-inch ultrawide monitor",
    category: "electronics",
    constraints: [{ field: "screen_size_inches", operator: "gte" as const, value: 34 }],
    searchWindowSeconds: 60 as const,
  },
};

const baseState: AIShoppingState = {
  status: "mandate_ready",
  messages: [{ id: "m1", role: "assistant", content: "Review the scope before approval.", createdAt: "2026-08-30T00:00:00Z" }],
  mandate,
  run: null,
  discoveredProducts: [],
  error: null,
  hydrated: true,
  storage: "backend",
  toast: null,
};

describe("real agent-run presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = baseState;
  });

  it("requests passkey approval for the structured mandate", async () => {
    render(<ChatExperience />);
    await userEvent.click(screen.getByRole("button", { name: /approve search mandate/i }));
    expect(mocks.requestApproval).toHaveBeenCalledOnce();
    expect(screen.getByText("34-inch ultrawide monitor")).toBeInTheDocument();
    expect(screen.getByText("60 seconds per authorization")).toBeInTheDocument();
  });

  it("renders the selected product, proof and settled attempt only from the completed run", () => {
    const product = {
      id: "8895d249-c8b5-42fa-bf76-c2bd87cb4ba2",
      slug: "aster-34",
      name: "Aster 34-inch UWQHD Monitor",
      description: "Ultrawide monitor",
      metadata: { category: "electronics", screen_size_inches: 34 },
      merchant: { id: "99b5b776-b5fc-4c55-8d7a-5425b34e861f", businessName: "Northstar Displays", status: "active" as const },
      offering: { id: "76114bed-b048-45eb-a677-c849a688cd15", amountMinor: 29243, currency: "usd" as const, scale: 2, active: true as const },
    };
    mocks.state = {
      ...baseState,
      status: "purchased",
      toast: "Purchase settled by Stripe within the mandate.",
      run: {
        runId: "62f05ca2-eb34-482b-b738-ed57658af699",
        ownerId: "c5e435f9-a672-4766-baf4-e0f621e83657",
        status: "completed",
        goal: "Buy an ultrawide monitor",
        mandateId: mandate.id,
        createdAt: "2026-08-30T00:00:00Z",
        updatedAt: "2026-08-30T00:00:03Z",
        events: [{ sequence: 1, type: "payment_settled", occurredAt: "2026-08-30T00:00:03Z", data: {} }],
        candidates: [product],
        selectedProduct: product,
        authorityChecks: [{ name: "marketplace_policy", passed: true, checkedAt: "2026-08-30T00:00:02Z" }],
        proofId: "proof-real-1",
        paymentAttempt: { id: "attempt-real-1", status: "settled", amountMinor: 29243, currency: "usd", providerPaymentId: "pi_test_123" },
        receipt: { method: "stripe", reference: "receipt-real-1", status: "settled" },
      },
    };

    render(<ChatExperience />);
    expect(screen.getAllByText("Aster 34-inch UWQHD Monitor").length).toBeGreaterThan(0);
    expect(screen.getByText("proof-real-1")).toBeInTheDocument();
    expect(screen.getByText("attempt-real-1")).toBeInTheDocument();
    expect(screen.getByText(/29243 USD minor units/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Purchase settled by Stripe");
  });
});
