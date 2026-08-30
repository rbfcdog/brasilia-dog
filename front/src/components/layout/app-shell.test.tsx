import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listConversations: vi.fn(),
  conversationMessages: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/providers/shopping-provider", () => ({
  useShoppingStore: () => ({ scheduledPurchases: [] }),
}));
vi.mock("@/services/backend-service", () => ({
  backendService: {
    listConversations: mocks.listConversations,
    conversationMessages: mocks.conversationMessages,
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createMerchantBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { email: "buyer@example.com" } } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

import { AppShell } from "@/components/layout/app-shell";

describe("recent conversations", () => {
  it("renders backend conversations as controls that open the selected chat", async () => {
    mocks.listConversations.mockResolvedValue({
      conversations: [{ id: "conversation-123", ownerId: "user-1", createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" }],
    });
    mocks.conversationMessages.mockResolvedValue({
      messages: [{ id: "message-1", conversationId: "conversation-123", role: "user", content: "Find household appliances under $100", createdAt: "2026-08-30T00:00:00Z" }],
    });
    const opened = vi.fn();
    window.addEventListener("nomad:open-conversation", opened);

    render(<AppShell><div>Chat</div></AppShell>);
    expect(screen.queryByText("Henrique Lacerda")).not.toBeInTheDocument();
    expect((await screen.findAllByText("buyer@example.com")).length).toBeGreaterThan(0);
    const conversation = await screen.findByRole("button", { name: "Find household appliances under $100" });
    await userEvent.click(conversation);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/?conversation=conversation-123"));
    expect(opened).toHaveBeenCalledOnce();
    window.removeEventListener("nomad:open-conversation", opened);
  });
});
