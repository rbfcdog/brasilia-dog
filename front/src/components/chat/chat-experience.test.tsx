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
  approve: vi.fn(),
  analyze: vi.fn(),
  execute: vi.fn(),
  sessionToken: "passkey-session" as string | null,
  backend: {
    listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    createConversation: vi.fn().mockResolvedValue({ conversation: { id: "conversation-1" } }),
    conversationMessages: vi.fn().mockResolvedValue({ messages: [] }),
    appendConversationEvent: vi.fn().mockResolvedValue({ event: {} }),
    appendConversationMessage: vi.fn().mockResolvedValue({ message: {} }),
  },
}));

vi.mock("@/lib/passkey-session", () => ({
  getPasskeySessionToken: () => mockData.sessionToken,
  clearPasskeySessionToken: vi.fn(),
  storePasskeySessionToken: vi.fn(),
}));

vi.mock("@/services/backend-service", () => ({
  backendService: mockData.backend,
}));
vi.mock("@/services/shopping-service", () => ({
  shoppingService: {
    analyze: mockData.analyze,
    execute: mockData.execute,
  },
}));
vi.mock("@/services/biometric-provider", () => ({
  passkeyBiometricProvider: { approve: mockData.approve },
}));

const purchaseResult = {
  kind: "purchased" as const,
  message: "Purchase complete.",
  listings: [
    {
      id: "offer-aster",
      merchant: "Northstar Displays",
      item: "Aster 34-inch UWQHD Monitor",
      price: 292.43,
      currency: "USD" as const,
      merchantVerified: true,
      qualifies: true,
      selected: true,
    },
    {
      id: "offer-over-limit",
      merchant: "Orbit Electronics",
      item: "Orbit 38-inch Monitor",
      price: 349,
      currency: "USD" as const,
      merchantVerified: true,
      qualifies: false,
      selected: false,
    },
  ],
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
    paymentMethod: { brand: "Visa", label: "Personal Visa", last4: "4242" },
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
    mockData.analyze.mockReset();
    mockData.backend.createConversation.mockClear();
    mockData.backend.appendConversationMessage.mockClear();
    mockData.backend.appendConversationEvent.mockClear();
    mockData.sessionToken = "passkey-session";
    mockData.approve.mockResolvedValue({
      approved: true,
      method: "passkey",
      approvedAt: "2026-08-29T00:00:00Z",
    });
    mockData.analyze.mockResolvedValue({
      kind: "mandate",
      message: "Review the scope before approval.",
      mandate: mockData.mandate,
    });
    mockData.execute.mockResolvedValue(purchaseResult);
  });

  it("accepts a shopping prompt before asking for passkey confirmation", async () => {
    mockData.sessionToken = null;
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));

    expect(await screen.findByText("34-inch ultrawide monitor")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockData.approve).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /approve search mandate/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm your identity");
  });

  it("shows the agent's catalog-search evidence beside prompt-led product results", async () => {
    mockData.analyze.mockResolvedValue({
      kind: "products",
      message: "These are the catalog matches.",
      products: [{
        slug: "air-purifier-room-index",
        name: "Air purifier room index",
        description: "Current clean-air delivery and filter comparison.",
        category: "home",
        price: 95,
        currency: "USD" as const,
      }],
      activity: [{
        type: "catalog_search",
        category: "home",
        query: "air purifier",
        maximumAmount: 100,
        resultSlugs: ["air-purifier-room-index"],
      }],
    });
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));

    expect(await screen.findByRole("article", { name: "Air purifier room index" })).toBeInTheDocument();
    expect(screen.getByText(/air purifier · up to \$100\.00/i)).toBeInTheDocument();
  });

  it("executes a mandate only after a verified native passkey approval", async () => {
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));
    expect(await screen.findByText("34-inch ultrawide monitor")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve search mandate/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm your identity");

    await user.click(screen.getByRole("button", { name: /confirm with passkey/i }));
    await screen.findByRole("status");
    expect(mockData.approve).toHaveBeenCalledWith({
      ...mockData.mandate,
      paymentMethodId: "payment-visa-4242",
    });
    expect((await screen.findAllByText("Aster 34-inch UWQHD Monitor")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$292.43").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Purchase completed within your mandate");
    expect(screen.getByRole("tab", { name: "Qualifying" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Orbit 38-inch Monitor")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "All offers" }));
    expect(screen.getByText("Orbit 38-inch Monitor")).toBeInTheDocument();
  });

  it("saves the deferred prompt, decision trail, approval, and purchase after passkey confirmation", async () => {
    mockData.sessionToken = null;
    mockData.approve.mockImplementation(async () => {
      mockData.sessionToken = "fresh-passkey-session";
      return {
        approved: true,
        method: "passkey" as const,
        approvedAt: "2026-08-29T00:00:00Z",
      };
    });
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole("button", { name: /buy now/i }));
    await user.click(screen.getByRole("button", { name: /approve search mandate/i }));
    await user.click(await screen.findByRole("button", { name: /confirm with passkey/i }));
    await screen.findByRole("status");

    expect(mockData.backend.createConversation).toHaveBeenCalledTimes(1);
    expect(mockData.backend.appendConversationMessage).toHaveBeenCalledTimes(4);
    expect(mockData.backend.appendConversationEvent).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({ type: "agent_response" }),
    );
    expect(mockData.backend.appendConversationEvent).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({
        type: "mandate_proposed",
        payload: expect.objectContaining({ id: "mandate-demo-1234" }),
      }),
    );
    expect(mockData.backend.appendConversationEvent).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({ type: "passkey_approved" }),
    );
    expect(mockData.backend.appendConversationEvent).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({ type: "payment_executed" }),
    );
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
    await user.click(screen.getByRole("button", { name: /approve search mandate/i }));
    await user.click(await screen.findByRole("button", { name: /confirm with passkey/i }));

    expect(mockData.execute).not.toHaveBeenCalled();
    expect(await screen.findByText(/Native passkey verification is required/i)).toBeInTheDocument();
  });
});
