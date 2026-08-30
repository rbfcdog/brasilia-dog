"use client";

import { AlertTriangle, ArrowUpRight, Bot, CheckCircle2, CircleDollarSign, RefreshCw, RotateCcw, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MerchantPage } from "@/components/merchant/merchant-page";
import { StatusBadge } from "@/components/merchant/status-badge";
import { formatCompactMoney, formatDateTime, formatMoney } from "@/lib/merchant-format";
import { emptyDashboardSummary, merchantService } from "@/services/merchant-service";
import type { MerchantDailySale, MerchantDashboardSummary, MerchantOrder } from "@/types/merchant";

type DashboardState = {
  summary: MerchantDashboardSummary;
  dailySales: MerchantDailySale[];
  recentOrders: MerchantOrder[];
};

function fillLastThirtyDays(sales: MerchantDailySale[]): Array<{ label: string; total: number }> {
  const byDate = new Map(sales.map((sale) => [sale.sale_date.slice(0, 10), sale.gmv_minor]));
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (29 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date), total: (byDate.get(key) ?? 0) / 100 };
  });
}

function MetricCard({ label, value, detail, icon: Icon, tone = "default" }: { label: string; value: string; detail: string; icon: typeof CircleDollarSign; tone?: "default" | "success" | "danger" }) {
  const iconTone = tone === "success" ? "bg-success text-success-ink" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary";
  return (
    <article className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4"><p className="text-sm text-subtle">{label}</p><span className={`grid size-9 place-items-center rounded-xl ${iconTone}`}><Icon className="size-4" /></span></div>
      <p className="mt-6 font-mono text-3xl font-semibold tracking-[-0.055em]">{value}</p>
      <p className="mt-2 text-xs text-muted">{detail}</p>
    </article>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardState>({ summary: emptyDashboardSummary, dailySales: [], recentOrders: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await merchantService.dashboard());
      setStatus("ready");
    } catch (caught) {
      setError((caught as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void merchantService.dashboard().then((nextData) => { if (active) { setData(nextData); setStatus("ready"); } }).catch((caught) => { if (active) { setError((caught as Error).message); setStatus("error"); } });
    return () => { active = false; };
  }, []);
  const chartData = useMemo(() => fillLastThirtyDays(data.dailySales), [data.dailySales]);
  const summary = data.summary;

  return (
    <MerchantPage eyebrow="Merchant / Overview" title="Dashboard" description="Thirty days of fixed-price performance, agent conversion, and operational proof." action={<button type="button" onClick={() => void load()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-sm font-medium shadow-sm transition hover:border-primary/25 hover:text-primary"><RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`} /> Refresh</button>}>
      {status === "error" ? (
        <div role="alert" className="mb-5 flex flex-col gap-4 rounded-2xl border border-danger/20 bg-danger-soft p-5 text-sm sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0 text-danger" /><div className="flex-1"><p className="font-medium text-danger">Projection unavailable</p><p className="mt-1 text-subtle">{error}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-medium"><RotateCcw className="size-4" /> Retry</button></div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Merchant metrics">
        <MetricCard label="Gross merchandise value" value={formatCompactMoney(summary.gmv_minor, summary.currency)} detail="Settled volume · last 30 days" icon={CircleDollarSign} tone="success" />
        <MetricCard label="AI-agent conversion" value={`${summary.agent_conversion_rate.toFixed(1)}%`} detail={`${summary.converted_orders} of ${summary.agent_attempts} verified attempts`} icon={Bot} />
        <MetricCard label="Settled orders" value={String(summary.settled_orders)} detail="Fixed-price orders completed" icon={ShoppingBag} tone="success" />
        <MetricCard label="Refunded / failed" value={`${summary.refunded_orders} / ${summary.failed_orders}`} detail="Requires operational attention" icon={RotateCcw} tone={summary.refunded_orders + summary.failed_orders > 0 ? "danger" : "default"} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.8fr]">
        <article className="min-h-[390px] rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Sales line</p><p className="mt-1 text-xs text-muted">Daily settled volume in USD</p></div><span className="rounded-full bg-success/40 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">30 days</span></div>
          <div className="mt-7 h-[280px]" role="img" aria-label="Line chart of daily sales for the last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(16,17,20,0.07)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={6} tick={{ fill: "#92949a", fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#92949a", fontSize: 10 }} tickFormatter={(value: number) => `$${value}`} />
                <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Sales"]} contentStyle={{ borderRadius: 12, borderColor: "rgba(16,17,20,.08)", boxShadow: "0 12px 30px rgba(16,17,20,.10)", fontSize: 12 }} />
                <Line type="monotone" dataKey="total" stroke="#3e4fe0" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#c7e956", stroke: "#3e4fe0", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-2xl border border-black/[0.08] bg-primary p-6 text-white shadow-sm">
          <div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-white/10"><CheckCircle2 className="size-5 text-success" /></span><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/45">System health</span></div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.04em]">Ready for agent traffic</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">Every visible order is scoped by Merchant ownership and backed by an auditable payment attempt.</p>
          <div className="mt-8 space-y-3 text-xs">
            {["RLS projections active", "Fixed pricing enforced", "Server-side commands only"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3"><span className="size-1.5 rounded-full bg-success" />{item}</div>)}
          </div>
        </article>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold">Recent orders</h2><p className="mt-1 text-xs text-muted">Latest agent-originated activity</p></div><a href="/merchant/orders" className="flex items-center gap-1 text-xs font-medium text-primary">View all <ArrowUpRight className="size-3.5" /></a></div>
        {data.recentOrders.length === 0 ? <div className="p-10 text-center"><ShoppingBag className="mx-auto size-6 text-muted" /><p className="mt-3 text-sm font-medium">No order activity yet</p><p className="mt-1 text-xs text-muted">Published products and verified attempts will appear here.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-canvas/80 font-mono text-[9px] uppercase tracking-[0.1em] text-muted"><tr><th className="px-5 py-3 font-medium">Order</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Risk</th><th className="px-5 py-3 text-right font-medium">Amount</th></tr></thead><tbody className="divide-y divide-black/[0.06]">{data.recentOrders.map((order) => <tr key={order.order_id}><td className="px-5 py-4"><p className="font-mono text-xs">{order.order_id.slice(0, 8)}</p><p className="mt-1 text-[11px] text-muted">{formatDateTime(order.created_at)}</p></td><td className="px-4 py-4 font-medium">{order.product_name}</td><td className="px-4 py-4"><StatusBadge value={order.status} /></td><td className="px-4 py-4"><StatusBadge value={order.risk_level} /></td><td className="px-5 py-4 text-right font-mono">{formatMoney(order.amount_minor, order.currency, order.scale)}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </MerchantPage>
  );
}
