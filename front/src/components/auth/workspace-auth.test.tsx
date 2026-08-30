import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceAuth } from "@/components/auth/workspace-auth";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

vi.mock("@/services/auth-service", () => ({
  authService: {
    session: vi.fn().mockRejectedValue(new Error("signed out")),
    signIn: mocks.signInWithPassword,
    signUp: vi.fn(),
  },
}));

describe("workspace authentication", () => {
  it("signs a buyer in and routes to the assistant", async () => {
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(
      "buyer@example.com",
      "password123",
    );
    expect(mocks.push).toHaveBeenCalledWith("/assistant");
  });

  it("selects merchant login and routes to the merchant dashboard", async () => {
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "merchant-1", email: "merchant@example.com" } });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.click(screen.getByRole("radio", { name: /merchant/i }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "merchant@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as merchant" }));

    expect(mocks.push).toHaveBeenCalledWith("/merchant/dashboard");
  });
});
