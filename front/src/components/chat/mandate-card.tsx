import { CalendarClock, Check, CreditCard, DollarSign, Fingerprint, ShieldCheck } from "lucide-react";
import { useShoppingStore } from "@/components/providers/shopping-provider";
import type { ChatFlowState, Mandate } from "@/types/shopping";

export function MandateCard({
  mandate,
  status,
  onApprove,
  onUpdate,
}: {
  mandate: Mandate;
  status: ChatFlowState;
  onApprove: () => void;
  onUpdate: (mandate: Mandate) => void;
}) {
  const { paymentMethods } = useShoppingStore();
  const locked = status !== "mandate_ready";
  const mandateActive = ["searching", "purchased", "scheduled"].includes(status);
  const buttonLabel = status === "purchased"
    ? "Mandate fulfilled"
    : mandateActive
      ? "Mandate active"
      : status === "biometric_confirmation"
        ? "Awaiting confirmation"
        : "Approve search mandate";

  function updateValidity(validityHours: number) {
    onUpdate({
      ...mandate,
      validityHours,
      validUntil: new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString(),
    });
  }

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
          <label className="rounded-xl border border-line bg-canvas p-3.5 focus-within:border-primary/40">
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
          </label>
          <label className="rounded-xl border border-line bg-canvas p-3.5 focus-within:border-primary/40">
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              <CalendarClock className="size-3.5" aria-hidden="true" /> Validity
            </span>
            <select
              name="validityHours"
              value={mandate.validityHours}
              disabled={locked}
              onChange={(event) => updateValidity(Number(event.target.value))}
              className="mt-2 w-full bg-transparent font-mono text-sm font-medium outline-none disabled:cursor-not-allowed"
            >
              <option value={24}>24 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
          </label>
        </div>

        <label className="mt-3 block rounded-xl border border-line bg-canvas p-3.5 focus-within:border-primary/40">
          <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            <CreditCard className="size-3.5" aria-hidden="true" /> Payment method
          </span>
          <select
            name="paymentMethodId"
            value={mandate.paymentMethodId}
            disabled={locked || paymentMethods.length === 0}
            onChange={(event) => onUpdate({ ...mandate, paymentMethodId: event.target.value })}
            className="mt-2 w-full bg-transparent text-sm font-medium outline-none disabled:cursor-not-allowed"
          >
            {paymentMethods.length === 0 ? <option value="">Add a payment method in Profile</option> : null}
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>{method.label} · {method.brand} •••• {method.last4}</option>
            ))}
          </select>
        </label>

        <div className="mt-4 space-y-2 text-xs text-subtle">
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> Verified merchants only</p>
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> No purchase above the approved maximum</p>
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success-ink" aria-hidden="true" /> Revocable until execution</p>
        </div>

        <button
          onClick={onApprove}
          disabled={locked || !mandate.paymentMethodId}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-primary/55"
        >
          <Fingerprint className="size-4" aria-hidden="true" />
          {buttonLabel}
        </button>
        <p className="mt-3 text-center text-[11px] text-muted">Approval requires a fresh device passkey verification. Payment remains subject to backend authorization.</p>
      </div>
    </article>
  );
}
