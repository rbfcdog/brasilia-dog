"use client";

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

async function merchantRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BACKEND_PROXY_PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { error?: string; detail?: string } | T | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload : null;
    throw new Error(error?.detail ?? error?.error ?? `Request failed with status ${response.status}.`);
  }
  return payload as T;
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
  async dashboard(): Promise<{ summary: MerchantDashboardSummary; dailySales: MerchantDailySale[]; recentOrders: MerchantOrder[] }> {
    const result = await merchantRequest<{ summary: MerchantDashboardSummary | null; dailySales: MerchantDailySale[]; recentOrders: MerchantOrder[] }>("/v1/merchant/dashboard");
    return { ...result, summary: result.summary ?? emptyDashboardSummary };
  },
  async orders(): Promise<MerchantOrder[]> {
    return (await merchantRequest<{ orders: MerchantOrder[] }>("/v1/merchant/orders")).orders;
  },
  async audit(orderId: string): Promise<MerchantAuditEvent[]> {
    return (await merchantRequest<{ events: MerchantAuditEvent[] }>(`/v1/merchant/orders/${encodeURIComponent(orderId)}/audit`)).events;
  },
  async catalog(): Promise<MerchantCatalogProduct[]> {
    return (await merchantRequest<{ products: MerchantCatalogProduct[] }>("/v1/merchant/catalog")).products;
  },
  finance(): Promise<{ receipts: MerchantFinanceReceipt[]; refundCases: MerchantRefundCase[] }> {
    return merchantRequest("/v1/merchant/finance");
  },
  createProduct(input: CreateMerchantProductInput) {
    return merchantRequest<{ product: { id: string; status: "draft" } }>("/v1/merchant/products", { method: "POST", body: JSON.stringify(input) });
  },
  publishProduct(productId: string) {
    return merchantRequest<{ product: { id: string; status: "published" } }>(`/v1/merchant/products/${encodeURIComponent(productId)}/publish`, { method: "POST" });
  },
  createRefundCase(input: CreateRefundCaseInput) {
    return merchantRequest<{ refundCase: { id: string; status: "requested" } }>("/v1/merchant/refund-cases", { method: "POST", body: JSON.stringify(input) });
  },
};
