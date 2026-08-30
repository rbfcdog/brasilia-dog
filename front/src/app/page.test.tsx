import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createMerchantBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
}));

describe("unified landing page", () => {
  it("offers separate Buyer and Merchant paths without an application shell", () => {
    render(<LandingPage />);
    expect(screen.getByRole("radio", { name: /buyer/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /merchant/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /sign in as buyer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /commerce for people and their agents/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /merchant navigation/i })).not.toBeInTheDocument();
  });
});
