import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatExperience } from "@/components/chat/chat-experience";
import { ShoppingProvider } from "@/components/providers/shopping-provider";

const mockData = vi.hoisted(() => ({
  mandate: {
    id: "mandate-demo-1234",
    scope: "34-inch ultrawide monitor",
    maximumAmount: 300,
    currency: "USD" as const,
    minimumScreenSize: 34,
    validUntil: "2026-09-01T00:00:00Z",
    validityHours: 72,
    paymentMethodId: "",
    status: "pending" as const,
    mockOutcome: "immediate" as const,
  },
}));

vi.mock("@/services/biometric-provider", () => ({
  simulatedBiometricProvider: {
    approve: vi.fn().mockResolvedValue({ approved: true, method: "simulated", approvedAt: "2026-08-29T00:00:00Z" }),
  },
}));

vi.mock("@/services/shopping-service", () => ({
  shoppingService: {
    analyze: vi.fn().mockResolvedValue({
      kind: "mandate",
      message: "Review the scope before approval.",
      mandate: mockData.mandate,
    }),
    execute: vi.fn().mockResolvedValue({
      kind: "purchased",
      message: "Purchase complete.",
      receipt: {
        id: "RCT-DEMO1234",
        mandateId: mockData.mandate.id,
        merchant: "Northstar Displays",
        item: "Aster 34-inch UWQHD Monitor",
        subtotal: 274,
        taxes: 18.43,
        total: 292.43,
        currency: "USD",
        purchasedAt: "2026-08-29T00:00:00Z",
        paymentMethod: { brand: "Visa", label: "Personal Visa", last4: "4242" },
        status: "approved",
      },
    }),
  },
}));

describe("chat purchase flow", () => {
  beforeEach(() => window.localStorage.clear());

  it("completes the deterministic $300 mandate flow", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingProvider>
        <ChatExperience />
      </ShoppingProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /buy now/i }));
    expect(await screen.findByText("34-inch ultrawide monitor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve mandate/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm your identity");

    await user.click(screen.getByRole("button", { name: /confirm with simulated biometrics/i }));
    expect(await screen.findByText("Aster 34-inch UWQHD Monitor")).toBeInTheDocument();
    expect(screen.getAllByText("$292.43").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Purchase completed within your mandate");
  });
});
