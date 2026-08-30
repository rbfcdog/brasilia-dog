import { ArrowDownRight, Check, CircleX, Download, ReceiptText, TrendingDown } from "lucide-react";
import { PageFrame } from "@/components/pages/page-frame";

const transactions = [
  { id: "RCT-8A31F2C0", item: "Aster 34-inch UWQHD Monitor", merchant: "Northstar Displays", date: "Aug 29, 2026", amount: "$292.43", status: "Approved" },
  { id: "ATT-2D91B7E4", item: "Mechanical keyboard", merchant: "Keystone Supply", date: "Aug 27, 2026", amount: "$184.00", status: "Declined" },
  { id: "RCT-7E62A901", item: "Office coffee subscription", merchant: "Orbit Roasters", date: "Aug 21, 2026", amount: "$38.90", status: "Approved" },
];

export default function HistoryPage() {
  return (
    <PageFrame
      eyebrow="Financial record"
      title="Purchase history"
      description="Every successful, declined, and interrupted attempt is preserved with the mandate and policy checks that governed it."
      actions={<button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 font-mono text-[10px] uppercase tracking-[0.1em]"><Download className="size-3.5" aria-hidden="true" /> Export</button>}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-primary/35 bg-[linear-gradient(135deg,#dde1ff_0%,#bcc5ff_100%)] p-5 text-ink shadow-soft md:col-span-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Approved spend · August</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <p className="font-mono text-3xl font-semibold">$331.33</p>
            <span className="flex items-center gap-1 rounded-full bg-success px-2.5 py-1 font-mono text-[9px] text-success-ink"><TrendingDown className="size-3" aria-hidden="true" /> 12% below limit</span>
          </div>
          <div className="mt-7 flex h-16 items-end gap-2" aria-label="Illustrative spending chart">
            {[30, 46, 25, 62, 42, 78, 54, 88, 66, 96, 71, 58].map((height, index) => (
              <span key={index} className="flex-1 rounded-t-sm bg-primary/35 last:bg-primary" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Policy decisions</p>
          <p className="mt-4 font-mono text-3xl font-semibold">03</p>
          <div className="mt-6 space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-subtle">Approved</span><span className="font-mono">02</span></div>
            <div className="flex justify-between"><span className="text-subtle">Declined</span><span className="font-mono text-danger">01</span></div>
            <div className="flex justify-between"><span className="text-subtle">Escalated</span><span className="font-mono">00</span></div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-primary/15 bg-primary-soft shadow-sm">
        <div className="flex items-center gap-2 border-b border-primary/15 px-5 py-4"><ReceiptText className="size-4 text-primary" aria-hidden="true" /><h2 className="text-sm font-semibold">Recent expenses</h2></div>
        <div className="divide-y divide-line bg-white/80">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="grid gap-3 bg-white/70 px-5 py-4 transition-colors hover:bg-white sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-8 place-items-center rounded-lg ${transaction.status === "Approved" ? "bg-success/35 text-success-ink" : "bg-danger-soft text-danger"}`}>
                  {transaction.status === "Approved" ? <Check className="size-4" aria-hidden="true" /> : <CircleX className="size-4" aria-hidden="true" />}
                </span>
                <div><p className="text-sm font-medium">{transaction.item}</p><p className="mt-1 text-xs text-muted">{transaction.merchant} · {transaction.date}</p></div>
              </div>
              <div className="flex items-center justify-between gap-5 pl-11 sm:pl-0">
                <div className="text-right"><p className="font-mono text-sm font-semibold">{transaction.amount}</p><p className={`mt-1 font-mono text-[9px] uppercase ${transaction.status === "Approved" ? "text-success-ink" : "text-danger"}`}>{transaction.status}</p></div>
                <ArrowDownRight className="size-4 text-primary/45" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}
