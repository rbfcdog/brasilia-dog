import type {
  CreateMerchantProductInput,
  CreateRefundCaseInput,
  MerchantAuditEvent,
  MerchantCatalogProduct,
  MerchantDailySale,
  MerchantFinanceReceipt,
  MerchantOrder,
  MerchantRefundCase,
} from "@/types/merchant";

function isoDaysAgo(days: number, hour = 14): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

const productFixtures = [
  {
    id: "prd-ultrawide",
    name: "34-inch Ultrawide Monitor",
    slug: "34-inch-ultrawide-monitor",
    amount: 89900,
  },
  {
    id: "prd-keyboard",
    name: "Low-profile Mechanical Keyboard",
    slug: "low-profile-mechanical-keyboard",
    amount: 14900,
  },
  {
    id: "prd-dock",
    name: "Thunderbolt 4 Dock",
    slug: "thunderbolt-4-dock",
    amount: 27900,
  },
];

const statuses = [
  "settled",
  "settled",
  "settled",
  "refunded",
  "challenged",
  "failed",
] as const;

const orders: MerchantOrder[] = Array.from({ length: 24 }, (_, index) => {
  const product = productFixtures[index % productFixtures.length];
  const status = statuses[index % statuses.length];
  const missingReceipt = status === "settled" && index === 8;
  const hasReceipt =
    (status === "settled" || status === "refunded") && !missingReceipt;
  const riskLevel =
    status === "failed" || missingReceipt
      ? "high"
      : status === "challenged"
        ? "medium"
        : "low";
  const riskReasons =
    status === "failed"
      ? ["payment_failed", "failure_code_present"]
      : missingReceipt
        ? ["settled_payment_missing_receipt"]
        : status === "challenged"
          ? ["unresolved_payment_challenge"]
          : ["agent_proof_verified", "receipt_attached"];

  return {
    order_id: `ord-demo-${String(index + 1).padStart(4, "0")}`,
    product_id: product.id,
    product_name: product.name,
    product_slug: product.slug,
    status,
    amount_minor: product.amount,
    currency: "usd",
    scale: 2,
    provider_payment_id:
      status === "challenged"
        ? null
        : `pi_demo_${String(index + 1).padStart(4, "0")}`,
    receipt: hasReceipt
      ? {
          reference: `rcpt_demo_${String(index + 1).padStart(4, "0")}`,
          method: "stripe_mpp",
        }
      : null,
    failure_code: status === "failed" ? "card_declined" : null,
    agent_execution_proof_id:
      status === "challenged" && index === 4
        ? null
        : `proof_demo_${String(index + 1).padStart(4, "0")}`,
    risk_level: riskLevel,
    risk_reasons: riskReasons,
    created_at: isoDaysAgo(index),
    settled_at:
      status === "settled" || status === "refunded"
        ? isoDaysAgo(index, 15)
        : null,
  };
});

const catalog: MerchantCatalogProduct[] = [
  {
    product_id: "prd-ultrawide",
    slug: "34-inch-ultrawide-monitor",
    name: "34-inch Ultrawide Monitor",
    description:
      "WQHD curved display with USB-C power delivery and exact panel specifications.",
    status: "published",
    metadata: {
      category: "monitor",
      screen_size_inches: 34,
      resolution: "3440x1440",
      usb_c: true,
    },
    amount_minor: 89900,
    currency: "usd",
    scale: 2,
    offering_active: true,
    endpoint_enabled: true,
    updated_at: isoDaysAgo(1),
  },
  {
    product_id: "prd-keyboard",
    slug: "low-profile-mechanical-keyboard",
    name: "Low-profile Mechanical Keyboard",
    description:
      "Wireless mechanical keyboard with hot-swappable switches and multi-device pairing.",
    status: "published",
    metadata: {
      category: "keyboard",
      layout: "ANSI",
      wireless: true,
      device_slots: 3,
    },
    amount_minor: 14900,
    currency: "usd",
    scale: 2,
    offering_active: true,
    endpoint_enabled: true,
    updated_at: isoDaysAgo(3),
  },
  {
    product_id: "prd-dock",
    slug: "thunderbolt-4-dock",
    name: "Thunderbolt 4 Dock",
    description:
      "Twelve-port workstation dock with dual-display support and 96W charging.",
    status: "published",
    metadata: {
      category: "dock",
      ports: 12,
      power_delivery_watts: 96,
      dual_display: true,
    },
    amount_minor: 27900,
    currency: "usd",
    scale: 2,
    offering_active: true,
    endpoint_enabled: true,
    updated_at: isoDaysAgo(5),
  },
  {
    product_id: "prd-headset-draft",
    slug: "studio-wireless-headset",
    name: "Studio Wireless Headset",
    description: "A draft product awaiting endpoint publication.",
    status: "draft",
    metadata: { category: "audio", noise_cancelling: true, battery_hours: 42 },
    amount_minor: 22900,
    currency: "usd",
    scale: 2,
    offering_active: false,
    endpoint_enabled: false,
    updated_at: isoDaysAgo(0),
  },
];

const dailySales: MerchantDailySale[] = Array.from(
  { length: 18 },
  (_, index) => ({
    sale_date: isoDaysAgo(17 - index).slice(0, 10),
    gmv_minor: [104800, 14900, 55900, 89900, 42800, 0][index % 6],
    settled_orders: [2, 1, 2, 1, 2, 0][index % 6],
    currency: "usd",
  }),
);

const receipts: MerchantFinanceReceipt[] = orders
  .filter((order) => order.receipt)
  .map((order, index) => ({
    ...order,
    receipt_reference: String(order.receipt?.reference),
    receipt_method: "stripe_mpp",
    refund_case_status: index === 0 ? "requested" : null,
  }));

const refundCases: MerchantRefundCase[] = receipts
  .slice(0, 2)
  .map((receipt, index) => ({
    refund_case_id: `rfnd-demo-${String(index + 1).padStart(3, "0")}`,
    payment_attempt_id: receipt.order_id,
    product_name: receipt.product_name,
    amount_minor:
      index === 0 ? receipt.amount_minor : Math.round(receipt.amount_minor / 2),
    currency: receipt.currency,
    reason: index === 0 ? "requested_by_customer" : "duplicate",
    note:
      index === 0
        ? "Customer requested an operational review."
        : "Possible duplicate agent execution.",
    status: index === 0 ? "requested" : "under_review",
    created_at: isoDaysAgo(index + 1),
    updated_at: isoDaysAgo(index),
  }));

function auditFor(order: MerchantOrder): MerchantAuditEvent[] {
  const events: MerchantAuditEvent[] = [
    {
      event_id: 1,
      order_id: order.order_id,
      occurred_at: order.created_at,
      actor_type: "buyer_agent",
      event_type: "payment_challenged",
      metadata: { product_id: order.product_id },
    },
  ];
  if (order.agent_execution_proof_id) {
    events.push({
      event_id: 2,
      order_id: order.order_id,
      occurred_at: order.created_at,
      actor_type: "verification_service",
      event_type: "agent_proof_verified",
      metadata: { proof_id: order.agent_execution_proof_id },
    });
  }
  if (order.status === "settled" || order.status === "refunded") {
    events.push({
      event_id: 3,
      order_id: order.order_id,
      occurred_at: order.settled_at ?? order.created_at,
      actor_type: "payment_provider",
      event_type: "payment_settled",
      metadata: { provider_payment_id: order.provider_payment_id },
    });
  } else if (order.status === "failed") {
    events.push({
      event_id: 3,
      order_id: order.order_id,
      occurred_at: order.created_at,
      actor_type: "payment_provider",
      event_type: "payment_failed",
      metadata: { failure_code: order.failure_code },
    });
  }
  if (order.status === "refunded") {
    events.push({
      event_id: 4,
      order_id: order.order_id,
      occurred_at: isoDaysAgo(0),
      actor_type: "operations",
      event_type: "payment_marked_refunded",
      metadata: {},
    });
  }
  return events;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const mockMerchantService = {
  async dashboard() {
    const attempts = orders.filter((order) => order.agent_execution_proof_id);
    const converted = attempts.filter(
      (order) => order.status === "settled" || order.status === "refunded",
    );
    const settled = orders.filter(
      (order) => order.status === "settled" || order.status === "refunded",
    );
    return clone({
      summary: {
        gmv_minor: settled.reduce(
          (total, order) => total + order.amount_minor,
          0,
        ),
        currency: "usd",
        settled_orders: settled.length,
        agent_attempts: attempts.length,
        converted_orders: converted.length,
        agent_conversion_rate: attempts.length
          ? (converted.length / attempts.length) * 100
          : 0,
        refunded_orders: orders.filter((order) => order.status === "refunded")
          .length,
        failed_orders: orders.filter((order) => order.status === "failed")
          .length,
      },
      dailySales,
      recentOrders: orders.slice(0, 5),
    });
  },

  async orders() {
    return clone(orders);
  },

  async audit(orderId: string) {
    const order = orders.find((item) => item.order_id === orderId);
    return order ? clone(auditFor(order)) : [];
  },

  async catalog() {
    return clone(catalog);
  },

  async finance() {
    return clone({ receipts, refundCases });
  },

  async createProduct(input: CreateMerchantProductInput) {
    const id = `prd-demo-${Date.now()}`;
    catalog.unshift({
      product_id: id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: "draft",
      metadata: input.metadata,
      amount_minor: input.amountMinor,
      currency: input.currency,
      scale: 2,
      offering_active: false,
      endpoint_enabled: false,
      updated_at: new Date().toISOString(),
    });
    return { product: { id, status: "draft" as const } };
  },

  async publishProduct(productId: string) {
    const product = catalog.find((item) => item.product_id === productId);
    if (!product) throw new Error("Demo product not found.");
    product.status = "published";
    product.offering_active = true;
    product.endpoint_enabled = true;
    product.updated_at = new Date().toISOString();
    return { product: { id: productId, status: "published" as const } };
  },

  async createRefundCase(input: CreateRefundCaseInput) {
    const receipt = receipts.find(
      (item) => item.order_id === input.paymentAttemptId,
    );
    if (!receipt) throw new Error("Demo receipt not found.");
    if (
      refundCases.some(
        (item) =>
          item.payment_attempt_id === input.paymentAttemptId &&
          ["requested", "under_review"].includes(item.status),
      )
    ) {
      throw new Error("An open refund case already exists for this order.");
    }
    const id = `rfnd-demo-${Date.now()}`;
    const now = new Date().toISOString();
    refundCases.unshift({
      refund_case_id: id,
      payment_attempt_id: input.paymentAttemptId,
      product_name: receipt.product_name,
      amount_minor: input.amountMinor ?? receipt.amount_minor,
      currency: receipt.currency,
      reason: input.reason,
      note: input.note ?? null,
      status: "requested",
      created_at: now,
      updated_at: now,
    });
    receipt.refund_case_status = "requested";
    return { refundCase: { id, status: "requested" as const } };
  },
};
