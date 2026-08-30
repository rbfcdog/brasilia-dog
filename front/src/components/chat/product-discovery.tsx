import { Database, ShieldCheck, Tag } from "lucide-react";
import type { AgentActivity, DiscoveredProduct } from "@/types/shopping";

function displayCategory(category: string) {
  return category.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ProductDiscovery({
  products,
  activity = [],
}: {
  products: DiscoveredProduct[];
  activity?: AgentActivity[];
}) {
  const catalogSearch = activity.find((entry) => entry.type === "catalog_search");
  const comparison = activity.find((entry) => entry.type === "product_comparison");

  return (
    <section className="max-w-2xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:ml-10" aria-label="Catalog products">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Current catalog results</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted">{products.length} {products.length === 1 ? "result" : "results"}</span>
          <span className="rounded-full bg-primary-soft px-2.5 py-1 font-mono text-[9px] uppercase text-primary">Tool results</span>
        </div>
      </div>
      {catalogSearch || comparison ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-primary-soft/35 px-5 py-3 text-xs text-subtle">
          {catalogSearch ? (
            <span className="inline-flex items-center gap-x-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-primary">Catalog search</span>
              <span aria-hidden="true">·</span>
              <span>{catalogSearch.query ?? catalogSearch.category ?? "catalog"}{catalogSearch.maximumAmount !== null ? ` · up to $${catalogSearch.maximumAmount.toFixed(2)}` : ""}</span>
            </span>
          ) : null}
          {comparison ? (
            <span className="rounded-full border border-primary/15 bg-white px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
              Compared {comparison.resultSlugs.length} catalog {comparison.resultSlugs.length === 1 ? "product" : "products"}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {products.map((product) => (
          <article key={product.slug} aria-label={product.name} className="group relative min-h-52 overflow-hidden bg-white p-5 transition-colors hover:bg-canvas focus-within:bg-canvas">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary-soft/65 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
                <Tag className="size-3" aria-hidden="true" />
                {displayCategory(product.category)}
              </span>
              <p className="shrink-0 font-mono text-lg font-semibold tracking-[-0.04em] text-ink">${product.price.toFixed(2)}</p>
            </div>
            <h4 className="mt-5 text-base font-semibold leading-5 tracking-[-0.025em] text-ink">{product.name}</h4>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-subtle">{product.description}</p>
            <p className="absolute inset-x-5 bottom-5 flex items-center gap-1.5 border-t border-line pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
              <ShieldCheck className="size-3 text-success-ink" aria-hidden="true" />
              Catalog record
            </p>
          </article>
        ))}
      </div>
      <p className="border-t border-line bg-canvas px-5 py-3 text-[11px] leading-5 text-muted">Browsing does not approve a purchase. Create and approve a search mandate before automatic selection or MPP execution.</p>
    </section>
  );
}
