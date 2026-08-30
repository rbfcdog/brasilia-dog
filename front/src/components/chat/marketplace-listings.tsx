"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { MarketplaceListing } from "@/types/shopping";

export function MarketplaceListings({ listings }: { listings: MarketplaceListing[] }) {
  const [tab, setTab] = useState<"qualifying" | "all">("qualifying");
  const visible = tab === "qualifying" ? listings.filter((listing) => listing.qualifies) : listings;

  return (
    <section className="max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:ml-10" aria-label="Marketplace offers">
      <div className="border-b border-line px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Automatic marketplace search</p>
            <h3 className="mt-1 text-lg font-semibold">Offers considered</h3>
          </div>
          <span className="rounded-full bg-success/35 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">{listings.length} found</span>
        </div>
        <div className="mt-4 flex gap-5" role="tablist" aria-label="Offer filters">
          {([['qualifying', 'Qualifying'], ['all', 'All offers']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 pb-3 text-xs font-medium ${tab === value ? "border-primary text-primary" : "border-transparent text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line">
        {visible.map((listing) => (
          <article key={listing.id} className={`flex items-center gap-3 px-5 py-4 ${listing.selected ? "bg-primary-soft" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{listing.item}</p>
                {listing.selected ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[8px] uppercase text-white">Selected</span> : null}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3 text-success-ink" /> {listing.merchant} · Verified merchant</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold">${listing.price.toFixed(2)}</p>
              <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${listing.qualifies ? "text-success-ink" : "text-danger"}`}>{listing.qualifies ? <Check className="size-3" /> : null}{listing.qualifies ? "Within mandate" : "Over limit"}</p>
            </div>
          </article>
        ))}
        {visible.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No offers currently qualify under this mandate.</p> : null}
      </div>
    </section>
  );
}
