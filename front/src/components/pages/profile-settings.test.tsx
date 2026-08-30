import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSettings } from "@/components/pages/profile-settings";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), signOut: vi.fn(), health: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/services/auth-service", () => ({ authService: { signOut: mocks.signOut } }));
vi.mock("@/services/backend-service", () => ({ backendService: { health: mocks.health } }));
vi.mock("@/components/pages/payment-settings", () => ({ PaymentSettings: () => null }));

describe("profile settings", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
    mocks.health.mockResolvedValue(undefined);
  });

  it("ends the customer session and returns to the home page", async () => {
    mocks.signOut.mockResolvedValue({ signedOut: true });
    const user = userEvent.setup();
    render(<ProfileSettings />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
