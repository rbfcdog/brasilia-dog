"use client";

import { createMerchantBrowserClient } from "@/lib/supabase/client";
import { isMerchantMockMode } from "@/lib/supabase/config";
import { mockMerchantService } from "@/services/merchant-mock-service";
import type {
  CreateMerchantProductInput,
  CreateRefundCaseInput,
  MerchantAuditEvent,
  MerchantCatalogProduct,
  MerchantDailySale,
  MerchantDashboardSummary,
  MerchantFinanceReceipt,
  MerchantOrder,
  MerchantRefundCase,
} from "@/types/merchant";

const BACKEND_PROXY_PREFIX = "/api/backend";

async function merchantCommand<T>(path: string, body?: unknown): Promise<T> {
  const supabase = createMerchantBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token)
    throw new Error("Your merchant session has expired.");

  const response = await fetch(`${BACKEND_PROXY_PREFIX}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    { error?: string; detail?: string } | T | null;
  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? payload
        : null;
    throw new Error(
      error?.detail ??
        error?.error ??
        `Request failed with status ${response.status}.`,
    );
  }
  return payload as T;
}

async function projection<T>(name: string, select = "*"): Promise<T[]> {
  const { data, error } = await createMerchantBrowserClient()
    .from(name)
    .select(select);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const emptyDashboardSummary: MerchantDashboardSummary = {
  gmv_minor: 0,
  currency: "usd",
  settled_orders: 0,
  agent_attempts: 0,
  converted_orders: 0,
  agent_conversion_rate: 0,
  refunded_orders: 0,
  failed_orders: 0,
};

export const merchantService = {
  async dashboard(): Promise<{
    summary: MerchantDashboardSummary;
    dailySales: MerchantDailySale[];
    recentOrders: MerchantOrder[];
  }> {
    if (isMerchantMockMode()) return mockMerchantService.dashboard();
    const supabase = createMerchantBrowserClient();
    const [summaryResult, salesResult, ordersResult] = await Promise.all([
      supabase.from("merchant_dashboard_projection").select("*").maybeSingle(),
      supabase
        .from("merchant_daily_sales_projection")
        .select("*")
        .order("sale_date", { ascending: true }),
      supabase
        .from("merchant_orders_projection")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    const error =
      summaryResult.error ?? salesResult.error ?? ordersResult.error;
    if (error) throw new Error(error.message);
    return {
      summary:
        (summaryResult.data as MerchantDashboardSummary | null) ??
        emptyDashboardSummary,
      dailySales: (salesResult.data ?? []) as MerchantDailySale[],
      recentOrders: (ordersResult.data ?? []) as MerchantOrder[],
    };
  },

  async orders(): Promise<MerchantOrder[]> {
    if (isMerchantMockMode()) return mockMerchantService.orders();
    const { data, error } = await createMerchantBrowserClient()
      .from("merchant_orders_projection")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MerchantOrder[];
  },

  async audit(orderId: string): Promise<MerchantAuditEvent[]> {
    if (isMerchantMockMode()) return mockMerchantService.audit(orderId);
    const { data, error } = await createMerchantBrowserClient()
      .from("merchant_order_audit_projection")
      .select("*")
      .eq("order_id", orderId)
      .order("occurred_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MerchantAuditEvent[];
  },

  catalog(): Promise<MerchantCatalogProduct[]> {
    if (isMerchantMockMode()) return mockMerchantService.catalog();
    return projection<MerchantCatalogProduct>("merchant_catalog_projection");
  },

  async finance(): Promise<{
    receipts: MerchantFinanceReceipt[];
    refundCases: MerchantRefundCase[];
  }> {
    if (isMerchantMockMode()) return mockMerchantService.finance();
    const [receipts, refundCases] = await Promise.all([
      projection<MerchantFinanceReceipt>("merchant_finance_projection"),
      projection<MerchantRefundCase>("merchant_refund_cases_projection"),
    ]);
    return { receipts, refundCases };
  },

  createProduct(input: CreateMerchantProductInput) {
    if (isMerchantMockMode()) return mockMerchantService.createProduct(input);
    return merchantCommand<{ product: { id: string; status: "draft" } }>(
      "/v1/merchant/products",
      input,
    );
  },

  publishProduct(productId: string) {
    if (isMerchantMockMode())
      return mockMerchantService.publishProduct(productId);
    return merchantCommand<{ product: { id: string; status: "published" } }>(
      `/v1/merchant/products/${encodeURIComponent(productId)}/publish`,
    );
  },

  createRefundCase(input: CreateRefundCaseInput) {
    if (isMerchantMockMode())
      return mockMerchantService.createRefundCase(input);
    return merchantCommand<{ refundCase: { id: string; status: "requested" } }>(
      "/v1/merchant/refund-cases",
      input,
    );
  },
};
