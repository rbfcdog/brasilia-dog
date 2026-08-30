import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  passkeyAuthOptions: vi.fn(),
  passkeyAuthVerify: vi.fn(),
}));

vi.mock("@/services/backend-service", () => ({
  backendService: {
    passkeyAuthOptions: mocks.passkeyAuthOptions,
    passkeyAuthVerify: mocks.passkeyAuthVerify,
  },
}));

import { authenticatePasskey } from "@/hooks/use-passkey";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("authenticatePasskey", () => {
  it("requests browser WebAuthn user verification when the backend requires biometric approval", async () => {
    mocks.passkeyAuthOptions.mockResolvedValue({
      challenge: "AQ",
      rpId: "localhost",
      userVerification: "required",
    });
    mocks.passkeyAuthVerify.mockResolvedValue({ verified: true, sessionToken: "fresh-session" });

    const get = vi.fn().mockResolvedValue({
      id: "credential-1",
      rawId: new Uint8Array([1]).buffer,
      type: "public-key",
      response: {
        authenticatorData: new Uint8Array([2]).buffer,
        clientDataJSON: new Uint8Array([3]).buffer,
        signature: new Uint8Array([4]).buffer,
      },
    });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: { get } });

    await authenticatePasskey();

    expect(get).toHaveBeenCalledWith(expect.objectContaining({
      publicKey: expect.objectContaining({
        rpId: "localhost",
        userVerification: "required",
      }),
    }));
    expect(mocks.passkeyAuthVerify).toHaveBeenCalledWith(expect.objectContaining({
      id: "credential-1",
      type: "public-key",
    }));
  });
});
