import { beforeEach, describe, expect, it } from "vitest";
import { demoStorage } from "@/lib/demo-storage";

describe("versioned demo storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves scheduled mandates across reads", () => {
    const purchase = {
      id: "SCH-1234",
      mandateId: "mandate-1234",
      scope: "34-inch ultrawide monitor",
      maximumAmount: 220,
      currency: "USD" as const,
      createdAt: "2026-08-29T00:00:00Z",
      validUntil: "2026-09-01T00:00:00Z",
      validityHours: 72,
      paymentMethod: { brand: "Visa" as const, label: "Personal Visa", last4: "4242" },
      status: "searching" as const,
    };

    demoStorage.writeScheduled([purchase]);
    expect(demoStorage.readScheduled()).toEqual([purchase]);
  });

  it("preserves payment methods and the preferred payment option", () => {
    const method = { id: "payment-1", brand: "Visa" as const, label: "Travel", last4: "0042", expiry: "10/29" };
    demoStorage.writePaymentMethods([method]);
    demoStorage.writePreferredPaymentMethodId(method.id);

    expect(demoStorage.readPaymentMethods()).toEqual([method]);
    expect(demoStorage.readPreferredPaymentMethodId()).toBe(method.id);
  });

  it("preserves reimbursement requests", () => {
    const requests = { "RCT-1234": "2026-08-29T00:00:00Z" };
    demoStorage.writeReimbursements(requests);
    expect(demoStorage.readReimbursements()).toEqual(requests);
  });
});
