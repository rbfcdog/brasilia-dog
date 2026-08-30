import { describe, expect, it } from "vitest";
import { mockMerchantService } from "@/services/merchant-mock-service";

describe("merchant demo service", () => {
  it("provides populated dashboard, order, catalog, and finance projections", async () => {
    const [dashboard, orders, catalog, finance] = await Promise.all([
      mockMerchantService.dashboard(),
      mockMerchantService.orders(),
      mockMerchantService.catalog(),
      mockMerchantService.finance(),
    ]);

    expect(dashboard.summary.gmv_minor).toBeGreaterThan(0);
    expect(dashboard.dailySales.length).toBeGreaterThan(0);
    expect(orders.length).toBeGreaterThan(20);
    expect(catalog.some((product) => product.status === "draft")).toBe(true);
    expect(finance.receipts.length).toBeGreaterThan(0);
  });

  it("creates and publishes a fixed-price demo product", async () => {
    const created = await mockMerchantService.createProduct({
      name: "Demo Camera",
      slug: "demo-camera",
      description: "A fixed-price product created during a demo test.",
      amountMinor: 12900,
      currency: "usd",
      metadata: { category: "camera", waterproof: true, megapixels: 24 },
    });

    expect(created.product.status).toBe("draft");
    await expect(
      mockMerchantService.publishProduct(created.product.id),
    ).resolves.toEqual({
      product: { id: created.product.id, status: "published" },
    });

    const product = (await mockMerchantService.catalog()).find(
      (item) => item.product_id === created.product.id,
    );
    expect(product).toMatchObject({
      status: "published",
      offering_active: true,
      endpoint_enabled: true,
      amount_minor: 12900,
    });
  });

  it("creates a pending refund case without changing payment state", async () => {
    const { receipts, refundCases } = await mockMerchantService.finance();
    const receipt = receipts.find(
      (item) =>
        !refundCases.some(
          (caseItem) => caseItem.payment_attempt_id === item.order_id,
        ),
    );
    expect(receipt).toBeDefined();

    const result = await mockMerchantService.createRefundCase({
      paymentAttemptId: receipt!.order_id,
      reason: "requested_by_customer",
      note: "Demo-only request",
    });

    expect(result.refundCase.status).toBe("requested");
    const updatedOrders = await mockMerchantService.orders();
    expect(
      updatedOrders.find((item) => item.order_id === receipt!.order_id)?.status,
    ).toBe(receipt!.status);
  });
});
