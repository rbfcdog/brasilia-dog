import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  health: vi.fn(),
  passkeyStatus: vi.fn(),
  fetch: vi.fn(),
  register: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("@/components/pages/payment-settings", () => ({ PaymentSettings: () => null }));
vi.mock("@/hooks/use-passkey", () => ({
  usePasskey: () => ({
    state: { status: "idle", message: null, sessionToken: null, userId: null },
    test: mocks.authenticate,
    register: mocks.register,
    authenticate: mocks.authenticate,
    signOut: vi.fn(),
    supported: true,
  }),
}));
vi.mock("@/lib/passkey-session", () => ({
  getPasskeySessionToken: () => null,
  clearPasskeySessionToken: vi.fn(),
}));
vi.mock("@/services/backend-service", () => ({
  backendService: { health: mocks.health, passkeyStatus: mocks.passkeyStatus },
}));
vi.mock("@/services/auth-service", () => ({
  authService: {
    session: mocks.session,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") } }));

import { ProfileSettings } from "@/components/pages/profile-settings";

describe("account-bound passkey enrollment QR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.health.mockResolvedValue({ ok: true });
    mocks.session.mockResolvedValue({ user: { id: "buyer-1", email: "buyer@example.com" } });
    mocks.passkeyStatus.mockResolvedValue({ registered: true, credentialCount: 1 });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("shows the QR generation error to a signed-in user and allows retry", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Enrollment migration is not applied." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        enrollmentUrl: "https://shop.example.test/api/passkey/enrollment/claim?token=grant",
        expiresAt: "2026-08-30T03:00:00.000Z",
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<ProfileSettings />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Enrollment migration is not applied.");
    expect(screen.queryByText(/^Sign in to generate/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry QR generation" }));

    expect(await screen.findByRole("img", { name: /QR code linking to passkey enrollment/i })).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("shows Active when the account has a registered passkey", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      enrollmentUrl: "https://shop.example.test/api/passkey/enrollment/claim?token=grant",
      expiresAt: "2026-08-30T03:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<ProfileSettings />);

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Registered")).not.toBeInTheDocument();
  });
});
