"use client";

import { ArrowRight, CalendarClock, Loader2, Radar, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageFrame } from "@/components/pages/page-frame";
import { shoppingService } from "@/services/shopping-service";
import type { PublicAgentRun } from "@/types/shopping";

export function ScheduledPurchases() {
  const [runs, setRuns] = useState<PublicAgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void shoppingService.listRuns().then(({ runs: loaded }) => {
      if (active) setRuns(loaded.filter((run) => ["queued", "running", "monitoring", "waiting_for_extension"].includes(run.status)));
    }).catch((caught) => { if (active) setError((caught as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <PageFrame eyebrow="Durable agent runs" title="Active monitoring" description="Every card is loaded from the persisted agent-run; no browser schedule can execute a purchase." actions={<Link href="/assistant" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-mono text-[10px] uppercase tracking-[0.1em] text-white">New request <ArrowRight className="size-3.5" /></Link>}>
    {loading ? <div className="flex h-56 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading agent runs…</div> : error ? <div role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</div> : runs.length === 0 ? <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-line bg-white p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Radar className="size-5" /></div><h2 className="mt-5 text-xl font-semibold">Nothing is being monitored</h2><p className="mt-2 text-sm text-subtle">Approve a structured mandate in the assistant.</p></div></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{runs.map((run) => <article key={run.runId} className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-success/35 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">{run.status}</span><span className="max-w-32 truncate font-mono text-[9px] text-muted">{run.runId}</span></div><h2 className="mt-5 text-lg font-semibold">{run.goal}</h2><p className="mt-2 font-mono text-sm">Mandate v{run.mandate?.version ?? "—"}</p><div className="mt-5 space-y-2 rounded-xl bg-canvas p-4 text-xs text-subtle"><p className="flex items-center gap-2"><Search className="size-3.5 text-primary" /> {run.events.at(-1)?.type.replaceAll("_", " ") ?? "queued"}</p><p className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-primary" /> {run.candidates.length} API-authorized candidates</p><p className="flex items-center gap-2"><CalendarClock className="size-3.5 text-primary" /> {run.mandate?.expiresAt ?? "Loading mandate"}</p></div>{run.status === "waiting_for_extension" ? <Link href="/assistant" className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-xs font-medium text-white">Resume with passkey</Link> : null}</article>)}</div>}
  </PageFrame>;
}
