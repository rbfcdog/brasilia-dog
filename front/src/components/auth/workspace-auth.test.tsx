import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceAuth } from "@/components/auth/workspace-auth";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
  passkeyStatus: vi.fn(),
  registerPasskey: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/services/auth-service", () => ({
  authService: {
    session: vi.fn().mockRejectedValue(new Error("signed out")),
    signIn: mocks.signInWithPassword,
    signUp: vi.fn(),
  },
}));

vi.mock("@/services/backend-service", () => ({
  backendService: { passkeyStatus: mocks.passkeyStatus },
}));

vi.mock("@/hooks/use-passkey", () => ({
  registerEnrolledPasskey: mocks.registerPasskey,
}));

describe("workspace authentication", () => {
  beforeEach(() => {
    mocks.search = "";
    mocks.push.mockClear();
    mocks.signInWithPassword.mockReset();
    mocks.passkeyStatus.mockResolvedValue({ registered: true, credentialCount: 1 });
    mocks.registerPasskey.mockReset();
  });
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

  it("enrolls a passkey before routing a first-time account", async () => {
    mocks.passkeyStatus.mockResolvedValue({ registered: false, credentialCount: 0 });
    mocks.registerPasskey.mockResolvedValue({ verified: true });
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));

    const setup = await screen.findByRole("button", { name: "Set up passkey" });
    await user.click(setup);
    expect(mocks.registerPasskey).toHaveBeenCalledOnce();
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

  it("returns a QR enrollment login to the profile page", async () => {
    mocks.search = "next=%2Fprofile%3Fenroll%3Dpasskey";
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));

    expect(mocks.push).toHaveBeenCalledWith("/profile?enroll=passkey");
  });
});
