import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("@/hooks/use-passkey", () => ({
  registerEnrolledPasskey: mocks.register,
  authenticateEnrolledPasskey: mocks.authenticate,
}));

import { PasskeyEnrollment } from "@/components/auth/passkey-enrollment";

describe("PasskeyEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "credentials", { configurable: true, value: {} });
  });

  it("verifies an existing synced passkey when registration reports it already exists", async () => {
    mocks.register.mockRejectedValue(new DOMException("Credential already exists.", "InvalidStateError"));
    mocks.authenticate.mockResolvedValue({ verified: true, sessionToken: "session" });
    const user = userEvent.setup();

    render(<PasskeyEnrollment />);
    await user.click(screen.getByRole("button", { name: /register passkey on this device/i }));

    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "An existing synced passkey was verified for this user.",
    );
  });
});
