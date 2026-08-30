"use client";

import { ArrowDownRight, Check, ChevronDown, CircleX, Download, ReceiptText, RotateCcw, ShieldCheck, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { PageFrame } from "@/components/pages/page-frame";
import { demoStorage } from "@/lib/demo-storage";

const transactions = [
  {
    id: "RCT-8A31F2C0", item: "Aster 34-inch UWQHD Monitor", merchant: "Northstar Displays", purchasedAt: "2026-08-29T13:20:00Z", total: 292.43, status: "Approved" as const,
    mandate: { scope: "34-inch ultrawide monitor", maximumAmount: 300, validUntil: "2026-09-01T12:00:00Z", scopeMatched: true, merchantVerified: true },
  },
  {
    id: "ATT-2D91B7E4", item: "Mechanical keyboard", merchant: "Keystone Supply", purchasedAt: "2026-08-27T16:45:00Z", total: 184, status: "Declined" as const,
    mandate: { scope: "Mechanical keyboard", maximumAmount: 150, validUntil: "2026-08-30T12:00:00Z", scopeMatched: true, merchantVerified: true },
  },
  {
    id: "RCT-7E62A901", item: "Office coffee subscription", merchant: "Orbit Roasters", purchasedAt: "2026-08-21T10:10:00Z", total: 38.9, status: "Approved" as const,
    mandate: { scope: "Monthly office coffee subscription", maximumAmount: 45, validUntil: "2026-08-22T12:00:00Z", scopeMatched: true, merchantVerified: true },
  },
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function mandateChecks(transaction: (typeof transactions)[number]) {
  return [
    { label: "Item matched approved scope", passed: transaction.mandate.scopeMatched },
    { label: `${currency.format(transaction.total)} stayed within the ${currency.format(transaction.mandate.maximumAmount)} limit`, passed: transaction.total <= transaction.mandate.maximumAmount },
    { label: "Merchant passed verification", passed: transaction.mandate.merchantVerified },
    { label: "Decision occurred before mandate expiry", passed: new Date(transaction.purchasedAt) <= new Date(transaction.mandate.validUntil) },
  ];
}

export default function HistoryPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reimbursements, setReimbursements] = useState<Record<string, string>>({});

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReimbursements(demoStorage.readReimbursements()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function requestReimbursement(transactionId: string) {
    const next = { ...reimbursements, [transactionId]: new Date().toISOString() };
    setReimbursements(next);
    demoStorage.writeReimbursements(next);
    setConfirmingId(null);
  }

  return (
    <PageFrame
      eyebrow="Financial record"
      title="Purchase history"
      description="Review every purchase against its mandate and request reimbursement for completed sales."
      actions={<button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 font-mono text-[10px] uppercase tracking-[0.1em] hover:border-line-strong"><Download className="size-3.5" aria-hidden="true" /> Export</button>}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-primary/35 bg-[linear-gradient(135deg,#dde1ff_0%,#bcc5ff_100%)] p-5 text-ink shadow-soft md:col-span-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Approved spend · August</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <p className="font-mono text-3xl font-semibold">$331.33</p>
            <span className="flex items-center gap-1 rounded-full bg-success px-2.5 py-1 font-mono text-[9px] text-success-ink"><TrendingDown className="size-3" aria-hidden="true" /> 12% below limit</span>
          </div>
          <div className="mt-7 flex h-16 items-end gap-2" role="img" aria-label="Illustrative spending chart">
            {[30, 46, 25, 62, 42, 78, 54, 88, 66, 96, 71, 58].map((height, index) => (
              <span key={index} className="flex-1 rounded-t-sm bg-primary/35 last:bg-primary" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Policy decisions</p>
          <p className="mt-4 font-mono text-3xl font-semibold">03</p>
          <div className="mt-6 space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-subtle">Compliant</span><span className="font-mono">02</span></div>
            <div className="flex justify-between"><span className="text-subtle">Blocked</span><span className="font-mono text-danger">01</span></div>
            <div className="flex justify-between"><span className="text-subtle">Under review</span><span className="font-mono">00</span></div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-primary/15 bg-primary-soft shadow-sm">
        <div className="flex items-center gap-2 border-b border-primary/15 px-5 py-4"><ReceiptText className="size-4 text-primary" aria-hidden="true" /><h2 className="text-sm font-semibold">Recent expenses</h2></div>
        <div className="divide-y divide-line bg-white/80">
          {transactions.map((transaction) => {
            const checks = mandateChecks(transaction);
            const compliant = transaction.status === "Approved" && checks.every((check) => check.passed);
            const expanded = expandedId === transaction.id;
            const reimbursed = Boolean(reimbursements[transaction.id]);
            return (
              <article key={transaction.id} className="bg-white/70 transition-colors hover:bg-white">
                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${transaction.status === "Approved" ? "bg-success/35 text-success-ink" : "bg-danger-soft text-danger"}`}>
                      {transaction.status === "Approved" ? <Check className="size-4" aria-hidden="true" /> : <CircleX className="size-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.item}</p><p className="mt-1 text-xs text-muted">{transaction.merchant} · {date.format(new Date(transaction.purchasedAt))}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pl-11 lg:justify-end lg:pl-0">
                    <div className="mr-2 text-left lg:text-right"><p className="font-mono text-sm font-semibold">{currency.format(transaction.total)}</p><p className={`mt-1 font-mono text-[9px] uppercase ${transaction.status === "Approved" ? "text-success-ink" : "text-danger"}`}>{transaction.status}</p></div>
                    <button type="button" onClick={() => setExpandedId(expanded ? null : transaction.id)} aria-expanded={expanded} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium hover:border-primary/30"><ShieldCheck className="size-3.5 text-primary" aria-hidden="true" /> Review mandate <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></button>
                    {transaction.status === "Approved" ? (
                      reimbursed ? <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-warning-soft px-3 text-xs font-medium text-warning-ink"><RotateCcw className="size-3.5" aria-hidden="true" /> Reimbursement requested</span>
                      : confirmingId === transaction.id ? <><button type="button" onClick={() => requestReimbursement(transaction.id)} className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-white hover:bg-primary-hover">Confirm request</button><button type="button" onClick={() => setConfirmingId(null)} className="h-9 rounded-lg px-3 text-xs font-medium text-subtle hover:bg-canvas">Cancel</button></>
                      : <button type="button" onClick={() => setConfirmingId(transaction.id)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium hover:border-primary/30"><RotateCcw className="size-3.5" aria-hidden="true" /> Request reimbursement</button>
                    ) : null}
                    <ArrowDownRight className="size-4 text-primary/45" aria-hidden="true" />
                  </div>
                </div>
                {expanded ? (
                  <div className="border-t border-line bg-canvas px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Mandate {transaction.id.replace(/^(RCT|ATT)/, "MND")}</p><p className="mt-1 text-sm font-medium">{transaction.mandate.scope}</p></div>
                      <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase ${compliant ? "bg-success/35 text-success-ink" : "bg-danger-soft text-danger"}`}>{compliant ? "Sale complied" : transaction.status === "Declined" ? "Sale blocked" : "Review required"}</span>
                    </div>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {checks.map((check) => <li key={check.label} className="flex items-center gap-2 text-xs text-subtle">{check.passed ? <Check className="size-3.5 text-success-ink" aria-hidden="true" /> : <CircleX className="size-3.5 text-danger" aria-hidden="true" />}{check.label}</li>)}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </PageFrame>
  );
}
