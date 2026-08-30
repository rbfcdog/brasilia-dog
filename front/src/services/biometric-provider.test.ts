import { afterEach, describe, expect, it, vi } from "vitest";

const getPasskeySessionToken = vi.hoisted(() => vi.fn());
const storePasskeySessionToken = vi.hoisted(() => vi.fn());
const verifyPasskeySession = vi.hoisted(() => vi.fn());
const demoPasskeyVerify = vi.hoisted(() => vi.fn());
const authenticatePasskey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/passkey-session", () => ({
  getPasskeySessionToken,
  storePasskeySessionToken,
}));
vi.mock("@/services/backend-service", () => ({
  backendService: { verifyPasskeySession, demoPasskeyVerify },
}));
vi.mock("@/hooks/use-passkey", () => ({ authenticatePasskey }));

import { passkeyBiometricProvider } from "@/services/biometric-provider";

const mandate = {
  id: "mandate-1",
  scope: "34-inch ultrawide monitor",
  maximumAmount: 300,
  currency: "USD",
  validUntil: "2026-09-02T00:00:00.000Z",
  status: "pending",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("passkey biometric provider", () => {
  it("creates a fresh native passkey session when approval follows an anonymous prompt", async () => {
    getPasskeySessionToken.mockReturnValue(null);
    authenticatePasskey.mockResolvedValue({
      verified: true,
      sessionToken: "fresh-session",
    });
    vi.stubGlobal("navigator", { credentials: {} });

    const approval = await passkeyBiometricProvider.approve(mandate);

    expect(verifyPasskeySession).not.toHaveBeenCalled();
    expect(authenticatePasskey).toHaveBeenCalledWith();
    expect(storePasskeySessionToken).toHaveBeenCalledWith("fresh-session");
    expect(approval).toMatchObject({ approved: true, method: "passkey" });
  });

  it("verifies the demo passkey without WebAuthn when the demo option is chosen", async () => {
    demoPasskeyVerify.mockResolvedValue({
      verified: true,
      sessionToken: "demo-session",
    });

    const approval = await passkeyBiometricProvider.approve(mandate, "demo");

    expect(authenticatePasskey).not.toHaveBeenCalled();
    expect(demoPasskeyVerify).toHaveBeenCalledWith();
    expect(storePasskeySessionToken).toHaveBeenCalledWith("demo-session");
    expect(approval).toMatchObject({ approved: true, method: "demo" });
  });

  it("reports a failed demo approval without falling back to WebAuthn", async () => {
    demoPasskeyVerify.mockRejectedValue(new Error("demo unavailable"));

    const approval = await passkeyBiometricProvider.approve(mandate, "demo");

    expect(authenticatePasskey).not.toHaveBeenCalled();
    expect(approval).toMatchObject({ approved: false, method: "demo" });
  });
});
