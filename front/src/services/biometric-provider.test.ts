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
  it("requires a fresh native passkey assertion before approval", async () => {
    getPasskeySessionToken.mockReturnValue("existing-session");
    verifyPasskeySession.mockResolvedValue({ userId: "user-1" });
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
      mockOutcome: "scheduled",
    });

    expect(verifyPasskeySession).toHaveBeenCalledWith("existing-session");
    expect(authenticatePasskey).toHaveBeenCalledWith("user-1");
    expect(storePasskeySessionToken).toHaveBeenCalledWith("fresh-session");
    expect(approval).toMatchObject({ approved: true, method: "passkey" });
  });
});
