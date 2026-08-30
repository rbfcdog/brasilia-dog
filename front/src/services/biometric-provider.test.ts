import { afterEach, describe, expect, it, vi } from "vitest";

const getPasskeySessionToken = vi.hoisted(() => vi.fn());
const storePasskeySessionToken = vi.hoisted(() => vi.fn());
const verifyPasskeySession = vi.hoisted(() => vi.fn());
const authenticatePasskey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/passkey-session", () => ({
  getPasskeySessionToken,
  storePasskeySessionToken,
}));
vi.mock("@/services/backend-service", () => ({
  backendService: { verifyPasskeySession },
}));
vi.mock("@/hooks/use-passkey", () => ({ authenticatePasskey }));

import { passkeyBiometricProvider } from "@/services/biometric-provider";

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

    const approval = await passkeyBiometricProvider.approve({
      id: "mandate-1",
      scope: "34-inch ultrawide monitor",
      maximumAmount: 300,
      currency: "USD",
      validUntil: "2026-09-02T00:00:00.000Z",
      status: "pending",
    });

    expect(verifyPasskeySession).not.toHaveBeenCalled();
    expect(authenticatePasskey).toHaveBeenCalledWith();
    expect(storePasskeySessionToken).toHaveBeenCalledWith("fresh-session");
    expect(approval).toMatchObject({ approved: true, method: "passkey" });
  });
});
