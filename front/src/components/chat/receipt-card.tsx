import { Check, ReceiptText, ShieldCheck } from "lucide-react";
import type { PublicAgentRun } from "@/types/shopping";

export function ReceiptCard({ run }: { run: PublicAgentRun }) {
  if (!run.receipt || !run.paymentAttempt || !run.selectedProduct) return null;
  return (
    <article className="max-w-xl overflow-hidden rounded-2xl border border-success/70 bg-white shadow-card sm:ml-10">
      <div className="flex items-center justify-between gap-4 bg-success px-5 py-4 text-success-ink"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-white/70"><Check className="size-4" /></span><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Stripe MPP settled</p></div><span className="font-mono text-[9px] uppercase tracking-[0.1em]">{run.paymentAttempt.status}</span></div>
      <div className="p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Receipt {run.receipt.reference}</p>
        <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{run.selectedProduct.name}</h3>
        <p className="mt-1 text-sm text-subtle">{run.selectedProduct.merchant.businessName}</p>
        <dl className="mt-5 space-y-2 rounded-xl bg-canvas p-4 font-mono text-[11px]">
          <div className="flex justify-between"><dt>AMOUNT</dt><dd>{run.paymentAttempt.amountMinor} {run.paymentAttempt.currency?.toUpperCase()} minor units</dd></div>
          <div className="flex justify-between"><dt>METHOD</dt><dd>{run.receipt.method}</dd></div>
          <div className="flex justify-between"><dt>PROOF</dt><dd className="max-w-48 truncate">{run.proofId}</dd></div>
          <div className="flex justify-between"><dt>ATTEMPT</dt><dd className="max-w-48 truncate">{run.paymentAttempt.id}</dd></div>
        </dl>
        <p className="mt-4 flex items-center gap-2 text-xs text-success-ink"><ShieldCheck className="size-4" /> Receipt, proof and payment attempt came from the same agent-run.</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted"><ReceiptText className="size-4" /> Provider reference: {run.paymentAttempt.providerPaymentId}</p>
      </div>
    </article>
  );
}
