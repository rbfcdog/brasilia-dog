"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSearch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MerchantPage } from "@/components/merchant/merchant-page";
import { StatusBadge } from "@/components/merchant/status-badge";
import {
  formatDateTime,
  formatMoney,
  humanizeCode,
} from "@/lib/merchant-format";
import { merchantService } from "@/services/merchant-service";
import type {
  MerchantAuditEvent,
  MerchantOrder,
  PaymentStatus,
  RiskLevel,
} from "@/types/merchant";

const PAGE_SIZE = 20;

function OrderDrawer({
  order,
  open,
  onOpenChange,
}: {
  order: MerchantOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [events, setEvents] = useState<MerchantAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !order) return;
    let active = true;
    void merchantService
      .audit(order.order_id)
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((caught) => {
        if (active) setError((caught as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, order]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-black/[0.08] bg-white p-0 shadow-2xl focus:outline-none data-[state=open]:animate-[slide-in-right_240ms_cubic-bezier(.22,1,.36,1)]">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-black/[0.08] bg-white/95 px-5 py-5 backdrop-blur md:px-6">
            <div>
              <Dialog.Title className="text-xl font-semibold tracking-[-0.035em]">
                Order intelligence
              </Dialog.Title>
              <Dialog.Description className="mt-1 font-mono text-[10px] text-muted">
                {order?.order_id}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="grid size-9 place-items-center rounded-xl border border-line hover:bg-canvas"
                aria-label="Close order intelligence"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          {order ? (
            <div className="space-y-5 p-5 md:p-6">
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-black/[0.08] bg-canvas p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                    Product
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {order.product_name}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-subtle">
                    {order.product_slug}
                  </p>
                </div>
                <div className="rounded-xl border border-black/[0.08] bg-canvas p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                    Fixed total
                  </p>
                  <p className="mt-2 font-mono text-xl font-semibold">
                    {formatMoney(
                      order.amount_minor,
                      order.currency,
                      order.scale,
                    )}
                  </p>
                  <div className="mt-2">
                    <StatusBadge value={order.status} />
                  </div>
                </div>
              </section>

              <section
                className={`rounded-2xl border p-5 ${order.risk_level === "high" ? "border-danger/20 bg-danger-soft" : order.risk_level === "medium" ? "border-warning/25 bg-warning-soft" : "border-success/60 bg-success/20"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    <h2 className="text-sm font-semibold">
                      Rules-based risk assessment
                    </h2>
                  </div>
                  <StatusBadge value={order.risk_level} />
                </div>
                <ul className="mt-4 space-y-2">
                  {order.risk_reasons.map((reason) => (
                    <li
                      key={reason}
                      className="flex items-start gap-2 text-xs leading-5 text-subtle"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
                      {humanizeCode(reason)}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-black/[0.07] pt-3 text-[10px] leading-5 text-muted">
                  Deterministic checks only. This assessment does not authorize
                  or reject a payment.
                </p>
              </section>

              <section className="rounded-2xl border border-black/[0.08] p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <FileSearch className="size-4 text-primary" /> Payment
                  evidence
                </h2>
                <dl className="mt-4 space-y-3 text-xs">
                  {[
                    [
                      "Provider reference",
                      order.provider_payment_id ?? "Not available",
                    ],
                    [
                      "Agent proof",
                      order.agent_execution_proof_id ?? "Not attached",
                    ],
                    ["Failure code", order.failure_code ?? "None"],
                    ["Created", formatDateTime(order.created_at)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="grid gap-1 sm:grid-cols-[130px_1fr]"
                    >
                      <dt className="text-muted">{label}</dt>
                      <dd className="break-all font-mono text-[10px]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Audit trail</h2>
                </div>
                {loading ? (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-canvas p-4 text-xs text-muted">
                    <Loader2 className="size-4 animate-spin" /> Loading verified
                    events…
                  </div>
                ) : error ? (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl bg-danger-soft p-4 text-xs text-danger"
                  >
                    {error}
                  </p>
                ) : events.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-canvas p-4 text-xs text-muted">
                    No audit events recorded for this attempt.
                  </p>
                ) : (
                  <ol className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
                    {events.map((event) => (
                      <li key={event.event_id} className="relative pl-7">
                        <span className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-white bg-primary shadow-[0_0_0_1px_#3e4fe0]" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium">
                            {humanizeCode(event.event_type)}
                          </p>
                          <time className="font-mono text-[9px] text-muted">
                            {formatDateTime(event.occurred_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-[11px] text-subtle">
                          Actor: {humanizeCode(event.actor_type)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function OrdersView() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "all">(
    "all",
  );
  const [risk, setRisk] = useState<RiskLevel | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MerchantOrder | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setOrders(await merchantService.orders());
      setStatus("ready");
    } catch (caught) {
      setMessage((caught as Error).message);
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    let active = true;
    void merchantService
      .orders()
      .then((items) => {
        if (active) {
          setOrders(items);
          setStatus("ready");
        }
      })
      .catch((caught) => {
        if (active) {
          setMessage((caught as Error).message);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const query = search.toLowerCase();
        const matchesSearch =
          !query ||
          order.order_id.toLowerCase().includes(query) ||
          order.product_name.toLowerCase().includes(query) ||
          order.product_slug.toLowerCase().includes(query);
        return (
          matchesSearch &&
          (paymentStatus === "all" || order.status === paymentStatus) &&
          (risk === "all" || order.risk_level === risk)
        );
      }),
    [orders, paymentStatus, risk, search],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <MerchantPage
      eyebrow="Merchant / Operations"
      title="Orders"
      description="Inspect purchases, payment evidence, agent proof, and risk signals without exposing buyer identity."
      action={
        <button
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-sm font-medium shadow-sm"
        >
          <RefreshCw
            className={`size-4 ${status === "loading" ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </button>
      }
    >
      <section className="rounded-2xl border border-black/[0.08] bg-white shadow-sm">
        <div className="grid gap-3 border-b border-black/[0.08] p-4 lg:grid-cols-[1fr_180px_160px]">
          <label className="relative">
            <span className="sr-only">Search orders</span>
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search order ID, product, or SKU"
              className="h-10 w-full rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label>
            <span className="sr-only">Payment status</span>
            <select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value as PaymentStatus | "all");
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              <option value="settled">Settled</option>
              <option value="challenged">Challenged</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Risk level</span>
            <select
              value={risk}
              onChange={(event) => {
                setRisk(event.target.value as RiskLevel | "all");
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option value="all">All risk levels</option>
              <option value="low">Low risk</option>
              <option value="medium">Medium risk</option>
              <option value="high">High risk</option>
            </select>
          </label>
        </div>
        {status === "error" ? (
          <div
            role="alert"
            className="m-4 flex items-center gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger"
          >
            <AlertTriangle className="size-4" />
            {message}
          </div>
        ) : status === "loading" && orders.length === 0 ? (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Loading order
            projections…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <FileSearch className="size-7 text-muted" />
            <p className="mt-3 text-sm font-medium">No matching orders</p>
            <p className="mt-1 text-xs text-muted">
              Try another filter or wait for verified agent traffic.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-canvas/80 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {visible.map((order) => (
                <tr
                  key={order.order_id}
                  tabIndex={0}
                  onClick={() => setSelected(order)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(order);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-primary-soft/40 focus:bg-primary-soft/50 focus:outline-none"
                >
                    <td className="px-5 py-4 font-mono text-xs text-primary">
                      {order.order_id.slice(0, 12)}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{order.product_name}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted">
                        {order.product_slug}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={order.status} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={order.risk_level} />
                    </td>
                    <td className="px-4 py-4 text-xs text-subtle">
                      {formatDateTime(order.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-xs">
                      {formatMoney(
                        order.amount_minor,
                        order.currency,
                        order.scale,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-black/[0.08] px-4 py-3">
          <p className="text-xs text-muted">
            {filtered.length} order{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-mono text-[10px] text-subtle">
              {page} / {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
              className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </section>
      <OrderDrawer
        key={selected?.order_id ?? "closed"}
        order={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </MerchantPage>
  );
}
