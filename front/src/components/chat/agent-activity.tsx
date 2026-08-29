import { Check, Circle, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import type { ChatFlowState } from "@/types/shopping";

export function AgentActivity({ status }: { status: ChatFlowState }) {
  const searching = status === "searching";
  const steps = searching
    ? [
        { label: "Understanding request", done: true },
        { label: "Mandate approved", done: true },
        { label: "Searching verified merchants", active: true },
        { label: "Comparing qualifying offers", active: false },
      ]
    : [
        { label: "Understanding your request", done: true },
        { label: "Extracting purchase constraints", active: true },
        { label: "Preparing a safe mandate", active: false },
      ];

  return (
    <div className="ml-10 max-w-lg rounded-xl border border-line bg-white p-4 shadow-sm" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {searching ? <Search className="size-4 text-primary" /> : <ShieldCheck className="size-4 text-primary" />}
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
            {searching ? "Searching marketplace" : "Analyzing request"}
          </p>
        </div>
        <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
      </div>
      <div className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <div key={step.label} className={`flex items-center gap-2 text-xs ${step.done || step.active ? "text-ink" : "text-muted"}`}>
            {step.done ? (
              <span className="grid size-4 place-items-center rounded-full bg-success text-success-ink">
                <Check className="size-2.5" aria-hidden="true" />
              </span>
            ) : step.active ? (
              <span className="relative grid size-4 place-items-center">
                <span className="absolute size-3 animate-ping rounded-full bg-primary/20 motion-reduce:animate-none" />
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
            ) : (
              <Circle className="size-4" aria-hidden="true" />
            )}
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}
