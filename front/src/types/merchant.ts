export type PaymentStatus = "challenged" | "settled" | "failed" | "refunded";
export type RiskLevel = "low" | "medium" | "high";
export type ProductStatus = "draft" | "published" | "archived";
export type RefundCaseStatus = "requested" | "under_review" | "approved" | "rejected" | "completed" | "failed";
export type MetadataValue = string | number | boolean;

export interface MerchantProfile {
  user_id: string;
  business_name: string;
  status: "active" | "suspended";
  created_at: string;
}

export interface MerchantDashboardSummary {
  gmv_minor: number;
  currency: string;
  settled_orders: number;
  agent_attempts: number;
  converted_orders: number;
  agent_conversion_rate: number;
  refunded_orders: number;
  failed_orders: number;
  gmv_growth_rate?: number;
  conversion_growth_points?: number;
  automation_rate?: number;
  average_order_value_minor?: number;
}

export interface MerchantDailySale {
  sale_date: string;
  gmv_minor: number;
  settled_orders: number;
  currency: string;
}

export interface MerchantOrder {
  order_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  status: PaymentStatus;
  amount_minor: number;
  currency: string;
  scale: number;
  provider_payment_id: string | null;
  receipt: Record<string, unknown> | null;
  failure_code: string | null;
  agent_execution_proof_id: string | null;
  risk_level: RiskLevel;
  risk_reasons: string[];
  created_at: string;
  settled_at: string | null;
}

export interface MerchantAuditEvent {
  event_id: number;
  order_id: string;
  occurred_at: string;
  actor_type: string;
  event_type: string;
  metadata: Record<string, unknown>;
}

export interface MerchantCatalogProduct {
  product_id: string;
  slug: string;
  name: string;
  description: string;
  status: ProductStatus;
  metadata: Record<string, MetadataValue>;
  amount_minor: number | null;
  currency: string | null;
  scale: number | null;
  offering_active: boolean;
  endpoint_enabled: boolean;
  updated_at: string;
}

export interface MerchantFinanceReceipt extends MerchantOrder {
  receipt_reference: string | null;
  receipt_method: string | null;
  refund_case_status: RefundCaseStatus | null;
}

export interface MerchantRefundCase {
  refund_case_id: string;
  payment_attempt_id: string;
  product_name: string;
  amount_minor: number;
  currency: string;
  reason: "duplicate" | "fraudulent" | "requested_by_customer";
  note: string | null;
  status: RefundCaseStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateMerchantProductInput {
  name: string;
  slug: string;
  description: string;
  amountMinor: number;
  currency: "usd";
  metadata: Record<string, MetadataValue>;
}

export interface CreateRefundCaseInput {
  paymentAttemptId: string;
  reason: MerchantRefundCase["reason"];
  amountMinor?: number;
  note?: string;
}
