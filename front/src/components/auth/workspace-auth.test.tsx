import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceAuth } from "@/components/auth/workspace-auth";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
  session: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  passkeyStatus: vi.fn(),
  createPasskeyEnrollment: vi.fn(),
  registerPasskey: vi.fn(),
  authenticatePasskey: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/services/auth-service", () => ({
  authService: {
    session: mocks.session,
    signIn: mocks.signInWithPassword,
    signUp: mocks.signUp,
    signOut: mocks.signOut,
  },
}));
vi.mock("@/services/backend-service", () => ({
  backendService: {
    passkeyStatus: mocks.passkeyStatus,
    createPasskeyEnrollment: mocks.createPasskeyEnrollment,
  },
}));

vi.mock("@/hooks/use-passkey", () => ({
  authenticatePasskey: mocks.authenticatePasskey,
  registerEnrolledPasskey: mocks.registerPasskey,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));

describe("workspace authentication", () => {
  beforeEach(() => {
    mocks.search = "";
    mocks.push.mockClear();
    mocks.session.mockRejectedValue(new Error("signed out"));
    mocks.signInWithPassword.mockReset();
    mocks.passkeyStatus.mockResolvedValue({ registered: true, credentialCount: 1 });
    mocks.registerPasskey.mockReset();
    mocks.authenticatePasskey.mockReset();
    mocks.signOut.mockReset();
    mocks.createPasskeyEnrollment.mockReset();
    mocks.createPasskeyEnrollment.mockResolvedValue({
      enrollmentUrl: "https://shop.example.test/api/passkey/enrollment/claim?token=test-token",
      expiresAt: "2026-08-30T09:00:00.000Z",
    });
    mocks.signUp.mockReset();
  });
  it("requires a passkey before routing a buyer to the assistant", async () => {
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.authenticatePasskey.mockResolvedValue({ verified: true, sessionToken: "passkey-session" });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));
    expect(mocks.push).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Continue with passkey" }));
    expect(mocks.authenticatePasskey).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/assistant");
  });

  it("requires a fresh explicit sign-in after passkey enrollment", async () => {
    mocks.passkeyStatus.mockResolvedValue({ registered: false, credentialCount: 0 });
    mocks.registerPasskey.mockResolvedValue({ verified: true });
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));

    await user.click(await screen.findByRole("button", { name: "Set up passkey" }));
    expect(mocks.registerPasskey).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Sign in as buyer" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("requires a passkey before routing a merchant to the merchant dashboard", async () => {
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "merchant-1", email: "merchant@example.com" } });
    mocks.authenticatePasskey.mockResolvedValue({ verified: true, sessionToken: "passkey-session" });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.click(screen.getByRole("radio", { name: /merchant/i }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "merchant@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as merchant" }));
    await user.click(await screen.findByRole("button", { name: "Continue with passkey" }));

    expect(mocks.push).toHaveBeenCalledWith("/merchant/dashboard");
  });

  it("returns a passkey-verified QR enrollment login to the profile page", async () => {
    mocks.search = "next=%2Fprofile%3Fenroll%3Dpasskey";
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.authenticatePasskey.mockResolvedValue({ verified: true, sessionToken: "passkey-session" });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));
    await user.click(await screen.findByRole("button", { name: "Continue with passkey" }));

    expect(mocks.push).toHaveBeenCalledWith("/profile?enroll=passkey");
  });


  it("lets an existing session switch to another account", async () => {
    mocks.session.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.signOut.mockResolvedValue({ signedOut: true });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.click(await screen.findByRole("button", { name: "Use another account" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Sign in as buyer" })).toBeInTheDocument();
  });
  it("sends a CPF when creating a buyer profile", async () => {
    mocks.signUp.mockResolvedValue({ confirmationRequired: true });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByRole("textbox", { name: "CPF" }), "529.982.247-25");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create buyer account" }));

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "buyer@example.com",
      password: "password123",
      cpf: "529.982.247-25",
      role: "buyer",
    });
  });

  it("requires a fresh explicit sign-in after passkey enrollment during account creation", async () => {
    mocks.passkeyStatus.mockResolvedValue({ registered: false, credentialCount: 0 });
    mocks.registerPasskey.mockResolvedValue({ verified: true });
    mocks.signUp.mockResolvedValue({ confirmationRequired: false, user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.signOut.mockResolvedValue({ signedOut: true });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByRole("textbox", { name: "CPF" }), "529.982.247-25");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create buyer account" }));
    await user.click(await screen.findByRole("button", { name: "Set up passkey" }));

    expect(mocks.registerPasskey).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Sign in as buyer" })).toBeInTheDocument();
  });

  it("offers a QR enrollment link when the current browser rejects passkey registration as insecure", async () => {
    mocks.passkeyStatus.mockResolvedValue({ registered: false, credentialCount: 0 });
    mocks.signInWithPassword.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.registerPasskey.mockRejectedValue(Object.assign(new Error("The operation is insecure."), { name: "SecurityError" }));
    mocks.createPasskeyEnrollment.mockResolvedValue({
      enrollmentUrl: "https://shop.example.test/api/passkey/enrollment/claim?token=single-use-token",
      expiresAt: "2026-08-30T09:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<WorkspaceAuth />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in as buyer" }));
    await user.click(await screen.findByRole("button", { name: "Set up passkey" }));

    expect(mocks.createPasskeyEnrollment).toHaveBeenCalled();
    expect(await screen.findByRole("img", { name: "Passkey enrollment QR code" })).toBeInTheDocument();
    expect(screen.getByText(/open this QR code on a secure device/i)).toBeInTheDocument();
  });
});
