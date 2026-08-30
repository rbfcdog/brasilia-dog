import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MerchantLogin } from "@/components/merchant/merchant-login";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  passkeyStatus: vi.fn(),
  authenticatePasskey: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/services/auth-service", () => ({
  authService: { signIn: mocks.signIn, signOut: mocks.signOut },
}));
vi.mock("@/services/backend-service", () => ({
  backendService: { passkeyStatus: mocks.passkeyStatus },
}));
vi.mock("@/hooks/use-passkey", () => ({
  authenticatePasskey: mocks.authenticatePasskey,
  registerEnrolledPasskey: vi.fn(),
}));

describe("merchant login", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.signIn.mockResolvedValue({ user: { id: "merchant-1" } });
    mocks.signOut.mockResolvedValue({ signedOut: true });
    mocks.passkeyStatus.mockResolvedValue({ registered: true, credentialCount: 1 });
    mocks.authenticatePasskey.mockResolvedValue({ verified: true, sessionToken: "passkey-session" });
  });

  it("requires passkey verification after password sign-in", async () => {
    const user = userEvent.setup();
    render(<MerchantLogin nextPath="/merchant/dashboard" />);

    await user.type(screen.getByRole("textbox", { name: "Work email" }), "merchant@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Enter Merchant OS" }));

    expect(mocks.replace).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Continue with passkey" }));

    expect(mocks.authenticatePasskey).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/merchant/dashboard");
  });

  it("can switch accounts before passkey verification", async () => {
    const user = userEvent.setup();
    render(<MerchantLogin nextPath="/merchant/dashboard" />);

    await user.type(screen.getByRole("textbox", { name: "Work email" }), "merchant@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Enter Merchant OS" }));
    await user.click(await screen.findByRole("button", { name: "Use another account" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Enter Merchant OS" })).toBeInTheDocument();
  });
});
