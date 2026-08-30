import { Check, Circle, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import type { ChatFlowState, PublicAgentRun } from "@/types/shopping";

export function AgentActivity({ status, run }: { status: ChatFlowState; run?: PublicAgentRun | null }) {
  const searching = status === "searching" || status === "waiting_for_extension";
  const events = run?.events ?? [];
  const steps = events.length > 0
    ? events.map((event) => ({ label: event.type.replaceAll("_", " "), done: true }))
    : searching
      ? [{ label: "Durable run queued", done: true }, { label: "Polling authoritative candidates", active: true }]
      : [{ label: "Understanding your request", done: true }, { label: "Preparing structured mandate", active: true }];
  return <div className="ml-10 max-w-lg rounded-xl border border-line bg-white p-4 shadow-sm" aria-live="polite"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2">{searching ? <Search className="size-4 text-primary" /> : <ShieldCheck className="size-4 text-primary" />}<p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em]">{run ? `Run ${run.status}` : searching ? "Starting durable run" : "Analyzing request"}</p></div>{!["purchased", "error", "waiting_for_extension"].includes(status) ? <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" /> : null}</div><div className="mt-4 space-y-2.5">{steps.map((step, index) => <div key={`${step.label}-${index}`} className="flex items-center gap-2 text-xs text-ink">{"done" in step && step.done ? <span className="grid size-4 place-items-center rounded-full bg-success text-success-ink"><Check className="size-2.5" /></span> : "active" in step && step.active ? <span className="relative grid size-4 place-items-center"><span className="absolute size-3 animate-ping rounded-full bg-primary/20" /><span className="size-1.5 rounded-full bg-primary" /></span> : <Circle className="size-4" />}{step.label}</div>)}</div></div>;
}
