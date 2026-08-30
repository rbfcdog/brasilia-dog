import { CreditCard, ShieldCheck } from "lucide-react";

export function PaymentSettings() {
  return <article className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><CreditCard className="size-5 text-primary" /><div><h2 className="font-semibold">Stripe MPP sandbox payer</h2><p className="mt-1 text-sm leading-6 text-subtle">The demo agent creates a short-lived Stripe Shared Payment Token with <span className="font-mono">pm_card_visa</span>. No card fixture or payment preference is stored in this browser.</p></div></div><div className="mt-5 flex items-center gap-2 rounded-xl bg-success/25 p-4 text-xs text-success-ink"><ShieldCheck className="size-4" /> Payment credentials remain agent-side and test-mode only.</div></article>;
}
