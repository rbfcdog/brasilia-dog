import { Check, CreditCard, ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import type { PurchaseReceipt } from "@/types/shopping";

export function ReceiptCard({ receipt }: { receipt: PurchaseReceipt }) {
  return (
    <article className="max-w-xl overflow-hidden rounded-2xl border border-success/70 bg-white shadow-card sm:ml-10">
      <div className="flex items-center justify-between gap-4 bg-success px-5 py-4 text-success-ink">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-white/70"><Check className="size-4" /></span>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Purchase approved</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em]">Completed</span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Receipt {receipt.id}</p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{receipt.item}</h3>
            <p className="mt-1 text-sm text-subtle">{receipt.merchant}</p>
          </div>
          <p className="font-mono text-xl font-semibold">${receipt.total.toFixed(2)}</p>
        </div>
        <div className="my-5 h-px bg-line" />
        <dl className="space-y-2 font-mono text-[11px]">
          <div className="flex justify-between text-subtle"><dt>SUBTOTAL</dt><dd>${receipt.subtotal.toFixed(2)}</dd></div>
          <div className="flex justify-between text-subtle"><dt>TAXES</dt><dd>${receipt.taxes.toFixed(2)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>TOTAL</dt><dd>${receipt.total.toFixed(2)} USD</dd></div>
        </dl>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <p className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-subtle"><ShieldCheck className="size-4 text-primary" /> Mandate verified</p>
          <p className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-subtle"><CreditCard className="size-4 text-primary" /> Visa •••• 4242</p>
        </div>
        <button className="mt-4 flex items-center gap-2 text-xs font-medium text-primary">
          <ReceiptText className="size-4" /> View authorization record <ExternalLink className="size-3" />
        </button>
      </div>
    </article>
  );
}
