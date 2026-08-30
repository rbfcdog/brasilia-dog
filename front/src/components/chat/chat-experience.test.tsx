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
    status: "pending" as const,
    mockOutcome: "immediate" as const,
  },
  approve: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/services/biometric-provider", () => ({
  passkeyBiometricProvider: {
    approve: mockData.approve,
  },
}));

vi.mock("@/services/shopping-service", () => ({
  shoppingService: {
    analyze: vi.fn().mockResolvedValue({
      kind: "mandate",
      message: "Review the scope before approval.",
      mandate: mockData.mandate,
    }),
    execute: mockData.execute,
  },
}));

const purchaseResult = {
  kind: "purchased" as const,
  message: "Purchase complete.",
  receipt: {
    id: "RCT-DEMO1234",
    mandateId: mockData.mandate.id,
    merchant: "Northstar Displays",
    item: "Aster 34-inch UWQHD Monitor",
    subtotal: 274,
    taxes: 18.43,
    total: 292.43,
    currency: "USD" as const,
    purchasedAt: "2026-08-29T00:00:00Z",
    status: "approved" as const,
  },
};

function renderChat() {
  render(
    <ShoppingProvider>
      <ChatExperience />
    </ShoppingProvider>,
  );
}

describe("chat purchase flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockData.approve.mockReset();
    mockData.execute.mockReset();
    mockData.approve.mockResolvedValue({
      approved: true,
      method: "passkey",
      approvedAt: "2026-08-29T00:00:00Z",
    });
    mockData.execute.mockResolvedValue(purchaseResult);
  });

  it("executes a mandate only after a verified native passkey approval", async () => {
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));
    expect(await screen.findByText("34-inch ultrawide monitor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve mandate/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm your identity");

    await user.click(screen.getByRole("button", { name: /confirm with passkey/i }));
    expect(mockData.approve).toHaveBeenCalledWith(mockData.mandate);
    expect(await screen.findByText("Aster 34-inch UWQHD Monitor")).toBeInTheDocument();
    expect(screen.getAllByText("$292.43").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Purchase completed within your mandate");
  });

  it("does not execute when the native passkey approval is rejected", async () => {
    mockData.approve.mockResolvedValue({
      approved: false,
      method: "passkey",
      approvedAt: "2026-08-29T00:00:00Z",
    });
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));
    await user.click(screen.getByRole("button", { name: /approve mandate/i }));
    await user.click(await screen.findByRole("button", { name: /confirm with passkey/i }));

    expect(mockData.execute).not.toHaveBeenCalled();
    expect(await screen.findByText(/Native passkey verification is required/i)).toBeInTheDocument();
  });
});
