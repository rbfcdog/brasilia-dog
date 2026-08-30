import { Database, ShieldCheck } from "lucide-react";
import type { DiscoveredProduct } from "@/types/shopping";

export function ProductDiscovery({ products }: { products: DiscoveredProduct[] }) {
  return (
    <section className="max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:ml-10" aria-label="Catalog products">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2"><Database className="size-4 text-primary" /><h3 className="text-sm font-semibold">Current catalog results</h3></div>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 font-mono text-[9px] uppercase text-primary">Tool results</span>
      </div>
      <div className="divide-y divide-line">
        {products.map((product) => (
          <article key={product.slug} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{product.name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-subtle">{product.description}</p>
                <p className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase text-muted"><ShieldCheck className="size-3 text-success-ink" /> Backend catalog · {product.category}</p>
              </div>
              <p className="shrink-0 font-mono text-sm font-semibold">${product.price.toFixed(2)}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="border-t border-line bg-canvas px-5 py-3 text-[11px] leading-5 text-muted">Browsing does not approve a purchase. Create and approve a search mandate before automatic selection or MPP execution.</p>
    </section>
  );
}
