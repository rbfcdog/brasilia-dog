"use client";

import { CreditCard, Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useShoppingStore } from "@/components/providers/shopping-provider";
import type { PaymentBrand } from "@/types/shopping";

export function PaymentSettings() {
  const {
    paymentMethods,
    preferredPaymentMethodId,
    addPaymentMethod,
    removePaymentMethod,
    setPreferredPaymentMethodId,
    hydrated,
  } = useShoppingStore();
  const [adding, setAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function submitPaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addPaymentMethod({
      brand: form.get("brand") as PaymentBrand,
      label: String(form.get("label")),
      last4: String(form.get("last4")),
      expiry: String(form.get("expiry")),
    });
    event.currentTarget.reset();
    setAdding(false);
    setMessage("Payment method added.");
  }

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Payment methods & preferences</h2>
            <p className="mt-0.5 text-xs text-muted">Only display details are stored in this browser demo</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((current) => !current)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-medium text-primary transition-colors hover:border-primary/30 hover:bg-primary-soft"
        >
          <Plus className="size-3.5" aria-hidden="true" /> {adding ? "Cancel" : "Add payment method"}
        </button>
      </div>

      {adding ? (
        <form onSubmit={submitPaymentMethod} className="mt-5 grid gap-3 rounded-xl border border-primary/15 bg-primary-soft/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium">Nickname
            <input name="label" required autoComplete="off" placeholder="Travel card…" className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-medium">Card brand
            <select name="brand" className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm">
              <option>Visa</option><option>Mastercard</option><option>Amex</option>
            </select>
          </label>
          <label className="text-xs font-medium">Last 4 digits
            <input name="last4" required inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="1234…" className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 font-mono text-sm" />
          </label>
          <label className="text-xs font-medium">Expiry
            <input name="expiry" required inputMode="numeric" autoComplete="cc-exp" pattern="(0[1-9]|1[0-2])/[0-9]{2}" placeholder="MM/YY…" className="mt-2 h-10 w-full rounded-lg border border-line bg-white px-3 font-mono text-sm" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover sm:col-span-2 lg:col-span-4">Save payment method</button>
        </form>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {!hydrated ? <div className="h-24 animate-pulse rounded-xl bg-canvas motion-reduce:animate-none" /> : null}
        {hydrated && paymentMethods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-5 text-sm text-subtle">Add a payment method before approving a purchase mandate.</p>
        ) : null}
        {hydrated ? paymentMethods.map((method) => {
          const preferred = method.id === preferredPaymentMethodId;
          return (
            <div key={method.id} className={`rounded-xl border p-4 ${preferred ? "border-primary/30 bg-primary-soft" : "border-line bg-canvas"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{method.label}</p>
                  <p className="mt-1 font-mono text-xs text-subtle">{method.brand} •••• {method.last4} · {method.expiry}</p>
                </div>
                {preferred ? <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-mono text-[9px] uppercase text-primary"><Star className="size-3" aria-hidden="true" /> Preferred</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!preferred ? (
                  <button type="button" onClick={() => { setPreferredPaymentMethodId(method.id); setMessage(`${method.label} is now preferred.`); }} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium hover:border-primary/30">Set as preferred</button>
                ) : null}
                {pendingRemoval === method.id ? (
                  <>
                    <button type="button" onClick={() => { removePaymentMethod(method.id); setPendingRemoval(null); setMessage("Payment method removed."); }} className="rounded-lg bg-danger px-3 py-2 text-xs font-medium text-white">Confirm removal</button>
                    <button type="button" onClick={() => setPendingRemoval(null)} className="rounded-lg px-3 py-2 text-xs font-medium text-subtle hover:bg-white">Keep method</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setPendingRemoval(method.id)} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${method.label}`}><Trash2 className="size-3.5" aria-hidden="true" /></button>
                )}
              </div>
            </div>
          );
        }) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
    </article>
  );
}
