import { ArrowRight, CalendarClock, Radar } from "lucide-react";
import Link from "next/link";
import type { ScheduledPurchase } from "@/types/shopping";

export function ScheduledResultCard({ purchase }: { purchase: ScheduledPurchase }) {
  return (
    <article className="max-w-xl rounded-2xl border border-primary/15 bg-primary-soft/60 p-5 shadow-sm sm:ml-10">
      <div className="flex items-center gap-2 text-primary">
        <Radar className="size-4 animate-pulse motion-reduce:animate-none" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">Mandate activated</p>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.025em]">Purchase scheduled</h3>
      <p className="mt-2 text-sm leading-6 text-subtle">I will keep monitoring verified merchants until a qualifying offer appears or the mandate expires.</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase text-subtle">
        <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" /> 72 hours remaining</span>
        <span>Max ${purchase.maximumAmount.toFixed(2)}</span>
      </div>
      <Link href="/scheduled" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
        Open scheduled purchases <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}
