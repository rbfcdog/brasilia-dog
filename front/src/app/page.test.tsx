import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingPage from "@/app/page";

describe("unified landing page", () => {
  it("offers separate Buyer and Merchant paths without an application shell", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: /continue with your agent/i })).toHaveAttribute("href", "/assistant");
    expect(screen.getAllByRole("link", { name: /merchant/i }).some((link) => link.getAttribute("href") === "/merchant/login")).toBe(true);
    expect(screen.getByRole("heading", { name: /commerce for people and their agents/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /merchant navigation/i })).not.toBeInTheDocument();
  });
});
