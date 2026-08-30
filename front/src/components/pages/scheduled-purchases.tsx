"use client";

import { ArrowRight, Ban, CalendarClock, CreditCard, Radar, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageFrame } from "@/components/pages/page-frame";
import { useShoppingStore } from "@/components/providers/shopping-provider";

function validityProgress(createdAt: string, validUntil: string) {
  const start = new Date(createdAt).getTime();
  const end = new Date(validUntil).getTime();
  const elapsed = Date.now() - start;
  return Math.max(1, Math.min(100, (elapsed / Math.max(end - start, 1)) * 100));
}

export function ScheduledPurchases() {
  const { scheduledPurchases, revokeScheduledPurchase, hydrated } = useShoppingStore();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  return (
    <PageFrame
      eyebrow="Active mandates"
      title="Scheduled purchases"
      description="Your agent keeps looking until an eligible offer appears or the mandate expires. No purchase can exceed the scope shown here."
      actions={
        <Link href="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-mono text-[10px] uppercase tracking-[0.1em] text-white shadow-sm transition hover:bg-primary-hover">
          New request <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {!hydrated ? (
        <div className="h-56 animate-pulse rounded-xl border border-line bg-white motion-reduce:animate-none" aria-label="Loading scheduled purchases" />
      ) : scheduledPurchases.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <div>
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Radar className="size-5" /></div>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Nothing is being monitored yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-subtle">Try the “Keep monitoring” prompt in the assistant to activate a scheduled mandate.</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">Open assistant <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scheduledPurchases.map((purchase) => {
            const progress = validityProgress(purchase.createdAt, purchase.validUntil);
            return (
              <article key={purchase.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${purchase.status === "searching" ? "bg-success/35 text-success-ink" : "bg-danger-soft text-danger"}`}>
                    {purchase.status === "searching" ? <span className="size-1.5 animate-pulse rounded-full bg-success-ink motion-reduce:animate-none" /> : <Ban className="size-3" aria-hidden="true" />}
                    {purchase.status === "searching" ? "Searching" : "Revoked"}
                  </span>
                  <span className="font-mono text-[9px] text-muted">{purchase.id}</span>
                </div>
                <h2 className="mt-5 text-lg font-semibold tracking-[-0.03em]">{purchase.scope}</h2>
                <p className="mt-2 font-mono text-xl font-semibold">≤ ${purchase.maximumAmount.toFixed(2)}</p>
                <div className="mt-6 rounded-xl bg-canvas p-4">
                  <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                    <span>Mandate validity</span><span>{purchase.validityHours} hours</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className={`h-full rounded-full ${purchase.status === "searching" ? "bg-primary" : "bg-danger"}`} style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-xs text-subtle">
                  <p className="flex items-center gap-2"><Search className="size-3.5 text-primary" aria-hidden="true" /> {purchase.status === "searching" ? "Searching verified merchants" : "Merchant search stopped"}</p>
                  <p className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-primary" aria-hidden="true" /> Purchase constraints locked</p>
                  <p className="flex items-center gap-2"><CalendarClock className="size-3.5 text-primary" aria-hidden="true" /> {purchase.status === "searching" ? "Expires automatically" : "Mandate can no longer execute"}</p>
                  <p className="flex items-center gap-2"><CreditCard className="size-3.5 text-primary" aria-hidden="true" /> {purchase.paymentMethod.label} · {purchase.paymentMethod.brand} •••• {purchase.paymentMethod.last4}</p>
                </div>
                {purchase.status === "searching" ? (
                  <div className="mt-5 border-t border-line pt-4">
                    {revokingId === purchase.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto text-xs text-subtle">Stop this mandate before it can execute?</p>
                        <button type="button" onClick={() => setRevokingId(null)} className="h-9 rounded-lg px-3 text-xs font-medium text-subtle hover:bg-canvas">Keep active</button>
                        <button type="button" onClick={() => { revokeScheduledPurchase(purchase.id); setRevokingId(null); }} className="h-9 rounded-lg bg-danger px-3 text-xs font-medium text-white hover:bg-red-600">Confirm revocation</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setRevokingId(purchase.id)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-danger/25 text-xs font-medium text-danger hover:bg-danger-soft"><Ban className="size-3.5" aria-hidden="true" /> Revoke purchase mandate</button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
