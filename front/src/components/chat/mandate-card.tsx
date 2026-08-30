import { CalendarClock, Check, DollarSign, Fingerprint, ShieldCheck } from "lucide-react";
import type { ChatFlowState, Mandate } from "@/types/shopping";

export function MandateCard({
  mandate,
  status,
  onApprove,
  onUpdate,
  onResume,
}: {
  mandate: Mandate;
  status: ChatFlowState;
  onApprove: () => void;
  onUpdate: (mandate: Mandate) => void;
  onResume?: () => void;
}) {
  const locked = status !== "mandate_ready";
const mandateActive = ["searching", "purchased", "waiting_for_extension"].includes(status);
  const buttonLabel = status === "purchased"
    ? "Mandate fulfilled"
    : mandateActive
      ? "Mandate active"
      : status === "biometric_confirmation"
        ? "Awaiting confirmation"
        : "Approve search mandate";

  return (
    <article className="max-w-xl overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-card sm:ml-10">
      <div className="border-b border-line bg-primary-soft/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Autonomous search mandate</p>
          </div>
          <span className="rounded-full border border-primary/15 bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
            {mandateActive ? "Active" : "Awaiting approval"}
          </span>
        </div>
      </div>

      <div className="p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Approved search scope</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{mandate.scope}</h3>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              <DollarSign className="size-3.5" aria-hidden="true" /> Maximum spend
            </span>
            <span className="mt-2 flex items-center font-mono text-lg font-semibold">
              $<input
                type="number"
                name="maximumAmount"
                min="1"
                step="1"
                value={mandate.maximumAmount}
                disabled={locked}
                onChange={(event) => onUpdate({ ...mandate, maximumAmount: Math.max(1, Number(event.target.value)) })}
                className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
              />
            </span>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              <CalendarClock className="size-3.5" aria-hidden="true" /> Validity
            </span>
            <p className="mt-2 font-mono text-sm font-medium">60 seconds per authorization</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs text-subtle">
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> Verified merchants only</p>
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> No purchase above the approved maximum</p>
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> Revocable until execution</p>
        </div>

        <button
onClick={status === "waiting_for_extension" ? onResume : onApprove}
          disabled={locked && status !== "waiting_for_extension"}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary/55"
        >
          <Fingerprint className="size-4" aria-hidden="true" />
          {status === "waiting_for_extension" ? "Extend mandate for 60 seconds" : buttonLabel}
        </button>
        <p className="mt-3 text-center text-[11px] text-muted">Approval requires a fresh device passkey verification. Payment remains subject to backend authorization.</p>
      </div>
    </article>
  );
}
