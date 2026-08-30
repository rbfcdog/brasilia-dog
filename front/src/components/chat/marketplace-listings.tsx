"use client";

import { Check, ShieldCheck } from "lucide-react";
import type { AgentRunProduct } from "@/types/shopping";

export function MarketplaceListings({ products, selectedSlug }: { products: AgentRunProduct[]; selectedSlug?: string }) {
  return (
    <section className="max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:ml-10" aria-label="Authorized marketplace candidates">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">API-authorized candidates</p><h3 className="mt-1 text-lg font-semibold">Listings from this run</h3></div>
        <span className="rounded-full bg-success/35 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">{products.length} compatible</span>
      </div>
      <div className="divide-y divide-line">
        {products.map((product) => (
          <article key={product.id} className={`flex items-center gap-3 px-5 py-4 ${product.slug === selectedSlug ? "bg-primary-soft" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{product.name}</p>{product.slug === selectedSlug ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[8px] uppercase text-white">Selected</span> : null}</div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3 text-success-ink" /> {product.merchant.businessName} · active authority</p>
            </div>
            <div className="text-right"><p className="font-mono text-sm font-semibold">{product.offering.amountMinor} minor units</p><p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-success-ink"><Check className="size-3" /> Authorized by API</p></div>
          </article>
        ))}
        {products.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No compatible product has been published yet.</p> : null}
      </div>
    </section>
  );
}
