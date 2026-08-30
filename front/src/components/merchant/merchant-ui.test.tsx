import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogView } from "@/components/merchant/catalog-view";
import { OrdersView } from "@/components/merchant/orders-view";

const mocks = vi.hoisted(() => ({
  orders: vi.fn(),
  audit: vi.fn(),
  catalog: vi.fn(),
  createProduct: vi.fn(),
  publishProduct: vi.fn(),
}));

vi.mock("@/services/merchant-service", () => ({
  merchantService: {
    orders: mocks.orders,
    audit: mocks.audit,
    catalog: mocks.catalog,
    createProduct: mocks.createProduct,
    publishProduct: mocks.publishProduct,
  },
}));

describe("merchant operations UI", () => {
  beforeEach(() => {
    mocks.orders.mockResolvedValue([]);
    mocks.audit.mockResolvedValue([]);
    mocks.catalog.mockResolvedValue([]);
    mocks.createProduct.mockResolvedValue({ product: { id: "product-1", status: "draft" } });
    mocks.publishProduct.mockResolvedValue({ product: { id: "product-1", status: "published" } });
  });

  it("uses a fixed-price, typed-metadata product form with no pricing-rule controls", async () => {
    const user = userEvent.setup();
    render(<CatalogView />);
    await screen.findByText("Your catalog is empty");
    await user.click(screen.getByRole("button", { name: /add first product/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Add a fixed-price product");
    expect(screen.getByLabelText("Metadata type")).toBeInTheDocument();
    expect(screen.queryByText(/discount margin|negotiation rules|bidding/i)).not.toBeInTheDocument();
  });

  it("shows auditable risk reasons in the order drawer", async () => {
    mocks.orders.mockResolvedValue([{ order_id: "11111111-1111-4111-8111-111111111111", product_id: "p1", product_name: "Ultrawide monitor", product_slug: "ultrawide-monitor", status: "failed", amount_minor: 29900, currency: "usd", scale: 2, provider_payment_id: null, receipt: null, failure_code: "card_declined", agent_execution_proof_id: "proof-1", risk_level: "high", risk_reasons: ["payment_failed", "failure_code_present"], created_at: "2026-08-30T00:00:00Z", settled_at: null }]);
    const user = userEvent.setup();
    render(<OrdersView />);
    await user.click(await screen.findByText("Ultrawide monitor"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rules-based risk assessment");
    expect(dialog).toHaveTextContent("Payment Failed");
    expect(dialog).toHaveTextContent("Failure Code Present");
  });
});
