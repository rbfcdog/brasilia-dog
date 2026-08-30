"use client";

import { Check, CircleX, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { PageFrame } from "@/components/pages/page-frame";
import { shoppingService } from "@/services/shopping-service";
import type { PublicAgentRun } from "@/types/shopping";

export default function HistoryPage() {
  const [runs, setRuns] = useState<PublicAgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void shoppingService.listRuns().then(({ runs }) => { if (active) setRuns(runs); })
      .catch((caught) => { if (active) setError((caught as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <PageFrame eyebrow="Agent-run ledger" title="Purchase history" description="Real mandates, proofs, payment attempts and Stripe receipts returned by durable runs.">
    {loading ? <div className="flex h-56 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading durable history…</div> : error ? <div role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</div> : runs.length === 0 ? <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-sm text-muted">No agent run has been created yet.</div> : <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-line px-5 py-4"><ReceiptText className="size-4 text-primary" /><h2 className="text-sm font-semibold">Persisted runs</h2></div><div className="divide-y divide-line">{runs.map((run) => {
      const completed = run.status === "completed";
      return <article key={run.runId} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className={`grid size-8 place-items-center rounded-lg ${completed ? "bg-success/35 text-success-ink" : run.status === "failed" || run.status === "rejected" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}>{completed ? <Check className="size-4" /> : <CircleX className="size-4" />}</span><div><p className="text-sm font-medium">{run.selectedProduct?.name ?? run.goal}</p><p className="mt-1 font-mono text-[10px] text-muted">{run.runId} · mandate {run.mandateId}</p></div></div><span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[9px] uppercase">{run.status}</span></div><div className="mt-4 grid gap-2 text-xs text-subtle sm:grid-cols-2">{run.authorityChecks.map((check) => <p key={`${run.runId}-${check.name}`} className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-success-ink" />{check.name.replaceAll("_", " ")}</p>)}{run.proofId ? <p className="truncate font-mono">Proof: {run.proofId}</p> : null}{run.paymentAttempt?.id ? <p className="truncate font-mono">Attempt: {run.paymentAttempt.id}</p> : null}{run.receipt?.reference ? <p className="truncate font-mono">Receipt: {run.receipt.reference}</p> : null}</div></article>;
    })}</div></div>}
  </PageFrame>;
}
