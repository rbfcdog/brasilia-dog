"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Boxes, Braces, Check, Copy, KeyRound, Loader2, Plus, RefreshCw, Rocket, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MerchantPage } from "@/components/merchant/merchant-page";
import { StatusBadge } from "@/components/merchant/status-badge";
import { formatDate, formatMoney } from "@/lib/merchant-format";
import { merchantService } from "@/services/merchant-service";
import type { MerchantCatalogProduct, MetadataValue } from "@/types/merchant";

type MetadataType = "string" | "number" | "boolean";
type MetadataRow = { id: number; key: string; type: MetadataType; value: string };

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseMetadata(rows: MetadataRow[]): Record<string, MetadataValue> {
  const metadata: Record<string, MetadataValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (key in metadata) throw new Error(`Metadata key “${key}” is duplicated.`);
    if (row.type === "number") {
      const parsed = Number(row.value);
      if (!Number.isFinite(parsed)) throw new Error(`Metadata value for “${key}” must be a number.`);
      metadata[key] = parsed;
    } else if (row.type === "boolean") metadata[key] = row.value === "true";
    else metadata[key] = row.value.trim();
  }
  if (Object.keys(metadata).length === 0) throw new Error("Add at least one structured metadata field.");
  return metadata;
}

function ProductDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [rows, setRows] = useState<MetadataRow[]>([{ id: 1, key: "category", type: "string", value: "" }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function updateRow(id: number, patch: Partial<MetadataRow>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const amount = Number(form.get("price"));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive fixed price.");
      await merchantService.createProduct({
        name: name.trim(),
        slug,
        description: String(form.get("description") ?? "").trim(),
        amountMinor: Math.round(amount * 100),
        currency: "usd",
        metadata: parseMetadata(rows),
      });
      onCreated();
      onOpenChange(false);
      setName(""); setSlug(""); setSlugTouched(false); setRows([{ id: Date.now(), key: "category", type: "string", value: "" }]);
    } catch (caught) { setError((caught as Error).message); }
    finally { setPending(false); }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white shadow-2xl focus:outline-none data-[state=open]:animate-dialog-in">
    <div className="sticky top-0 z-10 flex items-start justify-between border-b border-black/[0.08] bg-white/95 px-5 py-5 backdrop-blur md:px-6"><div><Dialog.Title className="text-xl font-semibold tracking-[-0.04em]">Add a fixed-price product</Dialog.Title><Dialog.Description className="mt-1 text-xs text-subtle">Create a draft with exact, agent-readable product facts.</Dialog.Description></div><Dialog.Close asChild><button className="grid size-9 place-items-center rounded-xl border border-line" aria-label="Close product form"><X className="size-4" /></button></Dialog.Close></div>
    <form onSubmit={(event) => void submit(event)} className="space-y-6 p-5 md:p-6">
      <section className="grid gap-4 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="text-xs font-medium">Product name</span><input required value={name} onChange={(event) => { setName(event.target.value); if (!slugTouched) setSlug(slugify(event.target.value)); }} placeholder="34-inch ultrawide monitor" className="mt-2 h-11 w-full rounded-xl border border-line px-3.5 text-sm outline-none focus:border-primary" /></label><label className="block"><span className="text-xs font-medium">SKU / slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} className="mt-2 h-11 w-full rounded-xl border border-line px-3.5 font-mono text-xs outline-none focus:border-primary" /></label><label className="block"><span className="text-xs font-medium">Fixed price</span><span className="relative mt-2 block"><span className="absolute inset-y-0 left-3.5 grid place-items-center font-mono text-xs text-muted">$</span><input name="price" required type="number" min="0.01" step="0.01" placeholder="299.00" className="h-11 w-full rounded-xl border border-line pl-7 pr-14 font-mono text-sm outline-none focus:border-primary" /><span className="absolute inset-y-0 right-3.5 grid place-items-center font-mono text-[9px] text-muted">USD</span></span></label><label className="block sm:col-span-2"><span className="text-xs font-medium">Description</span><textarea name="description" required minLength={10} rows={3} placeholder="Describe what the buyer receives." className="mt-2 w-full resize-none rounded-xl border border-line px-3.5 py-3 text-sm outline-none focus:border-primary" /></label></section>
      <section><div className="flex items-end justify-between gap-4"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Braces className="size-4 text-primary" /> Structured metadata</h3><p className="mt-1 text-xs text-muted">Use typed values so agents can compare exact specifications.</p></div><button type="button" onClick={() => setRows((current) => [...current, { id: Date.now(), key: "", type: "string", value: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium"><Plus className="size-3.5" /> Field</button></div><div className="mt-4 space-y-2">{rows.map((row) => <div key={row.id} className="grid gap-2 rounded-xl border border-line bg-canvas p-2 sm:grid-cols-[1fr_125px_1fr_34px]"><input aria-label="Metadata key" required value={row.key} onChange={(event) => updateRow(row.id, { key: event.target.value })} placeholder="screen_size_inches" className="h-9 rounded-lg border border-line bg-white px-3 font-mono text-xs outline-none focus:border-primary" /><select aria-label="Metadata type" value={row.type} onChange={(event) => updateRow(row.id, { type: event.target.value as MetadataType, value: event.target.value === "boolean" ? "true" : "" })} className="h-9 rounded-lg border border-line bg-white px-2 text-xs outline-none"><option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option></select>{row.type === "boolean" ? <select aria-label="Metadata value" value={row.value} onChange={(event) => updateRow(row.id, { value: event.target.value })} className="h-9 rounded-lg border border-line bg-white px-2 text-xs"><option value="true">True</option><option value="false">False</option></select> : <input aria-label="Metadata value" required value={row.value} type={row.type === "number" ? "number" : "text"} onChange={(event) => updateRow(row.id, { value: event.target.value })} placeholder={row.type === "number" ? "34" : "OLED"} className="h-9 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-primary" />}<button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30" aria-label="Remove metadata field"><Trash2 className="size-3.5" /></button></div>)}</div></section>
      <div className="rounded-xl border border-primary/15 bg-primary-soft p-4"><p className="flex items-center gap-2 text-xs font-medium text-primary"><KeyRound className="size-4" /> One price, one source of truth</p><p className="mt-2 text-xs leading-5 text-subtle">The draft stays inactive until you review and publish it. Payment rail configuration is supplied by the server.</p></div>
      {error ? <p role="alert" className="rounded-xl bg-danger-soft p-4 text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2"><Dialog.Close asChild><button type="button" className="h-10 rounded-xl border border-line px-4 text-sm font-medium">Cancel</button></Dialog.Close><button disabled={pending} type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create draft</button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function CatalogView() {
  const [products, setProducts] = useState<MerchantCatalogProduct[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  const load = useCallback(async () => { setStatus("loading"); try { setProducts((await merchantService.catalog()).sort((a, b) => b.updated_at.localeCompare(a.updated_at))); setStatus("ready"); } catch (caught) { setMessage((caught as Error).message); setStatus("error"); } }, []);
  useEffect(() => {
    let active = true;
    void merchantService.catalog().then((items) => { if (active) { setProducts(items.sort((a, b) => b.updated_at.localeCompare(a.updated_at))); setStatus("ready"); } }).catch((caught) => { if (active) { setMessage((caught as Error).message); setStatus("error"); } });
    return () => { active = false; };
  }, []);
  const publishedCount = useMemo(() => products.filter((product) => product.status === "published").length, [products]);

  const discoverableCount = useMemo(() => products.filter((product) => product.status === "published" && product.offering_active && product.endpoint_enabled).length, [products]);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  async function copyEndpoint(slug: string) {
    await navigator.clipboard.writeText(`/v1/products/${slug}/mpp`);
    setCopiedSlug(slug);
    window.setTimeout(() => setCopiedSlug((current) => current === slug ? null : current), 1800);
  }
  async function publish(product: MerchantCatalogProduct) {
    if (!window.confirm(`Publish ${product.name} at ${formatMoney(product.amount_minor ?? 0, product.currency ?? "usd", product.scale ?? 2)}?`)) return;
    setPublishing(product.product_id); setMessage("");
    try { await merchantService.publishProduct(product.product_id); await load(); }
    catch (caught) { setMessage((caught as Error).message); }
    finally { setPublishing(null); }
  }

  return <MerchantPage eyebrow="Merchant / Inventory" title="Catalog" description="Publish structured products with a single fixed price that buyer agents can evaluate exactly." action={<button onClick={() => setDialogOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-soft"><Plus className="size-4" /> Add product</button>}>
    <section className="mb-4 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm"><p className="text-xs text-muted">Total products</p><p className="mt-4 font-mono text-3xl font-semibold">{products.length}</p></div><div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm"><p className="text-xs text-muted">Published</p><p className="mt-4 font-mono text-3xl font-semibold text-success-ink">{publishedCount}</p></div><div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm"><p className="text-xs text-muted">Drafts</p><p className="mt-4 font-mono text-3xl font-semibold text-primary">{products.length - publishedCount}</p></div></section>
    <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary-soft/45 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm"><Rocket className="size-4" /></span>
        <div><p className="text-sm font-semibold">Agent visibility</p><p className="mt-1 text-xs leading-5 text-subtle">Published products with an active MPP endpoint are discoverable in buyer-agent searches.</p></div>
      </div>
      <p className="shrink-0 rounded-lg bg-white/75 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">{discoverableCount} {discoverableCount === 1 ? "product" : "products"} discoverable</p>
    </section>
    {discoverableCount > 0 ? <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="text-sm font-semibold">Live agent endpoints</h2><p className="mt-1 text-xs text-muted">The exact routes buyer agents can discover and call after authorization.</p></div><Rocket className="size-4 text-success-ink" /></div><div className="divide-y divide-line">{products.filter((product) => product.status === "published" && product.offering_active && product.endpoint_enabled).slice(0, 4).map((product) => <div key={product.product_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="mt-1 truncate font-mono text-[10px] text-muted">/v1/products/{product.slug}/mpp · {Object.keys(product.metadata).length} structured fields</p></div><button type="button" onClick={() => void copyEndpoint(product.slug)} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-line px-3 text-xs font-medium text-subtle hover:border-primary/30 hover:text-primary">{copiedSlug === product.slug ? <Check className="size-3.5 text-success-ink" /> : <Copy className="size-3.5" />}{copiedSlug === product.slug ? "Copied" : "Copy route"}</button></div>)}</div></section> : null}
    {message ? <div role="alert" className={`mb-4 flex items-center gap-2 rounded-xl p-4 text-xs ${status === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning-ink"}`}><AlertTriangle className="size-4" />{message}</div> : null}
    <section className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-black/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold">Agent-readable inventory</h2><p className="mt-1 text-xs text-muted">Drafts are never visible to buyer agents.</p></div><button onClick={() => void load()} className="grid size-9 place-items-center rounded-xl border border-line" aria-label="Refresh catalog"><RefreshCw className={`size-4 ${status === "loading" ? "animate-spin" : ""}`} /></button></div>
      {status === "loading" && products.length === 0 ? <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading catalog projection…</div> : products.length === 0 ? <div className="flex h-64 flex-col items-center justify-center text-center"><Boxes className="size-8 text-muted" /><p className="mt-3 text-sm font-medium">Your catalog is empty</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted">Create a fixed-price draft with structured metadata, then publish it when ready.</p><button onClick={() => setDialogOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white"><Plus className="size-4" /> Add first product</button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-canvas/80 font-mono text-[9px] uppercase tracking-[0.1em] text-muted"><tr><th className="px-5 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Structured fields</th><th className="px-4 py-3 font-medium">Updated</th><th className="px-4 py-3 text-right font-medium">Fixed price</th><th className="px-5 py-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y divide-black/[0.06]">{products.map((product) => <tr key={product.product_id}><td className="px-5 py-4"><p className="font-medium">{product.name}</p><p className="mt-1 font-mono text-[10px] text-muted">{product.slug}</p></td><td className="px-4 py-4"><StatusBadge value={product.status} /></td><td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 font-mono text-[10px]"><Braces className="size-3 text-primary" />{Object.keys(product.metadata).length}</span></td><td className="px-4 py-4 text-xs text-subtle">{formatDate(product.updated_at)}</td><td className="px-4 py-4 text-right font-mono text-xs">{product.amount_minor === null ? "—" : formatMoney(product.amount_minor, product.currency ?? "usd", product.scale ?? 2)}</td><td className="px-5 py-4 text-right">{product.status === "draft" ? <button disabled={publishing === product.product_id} onClick={() => void publish(product)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-xs font-medium text-primary disabled:opacity-60">{publishing === product.product_id ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Publish</button> : <span className="inline-flex items-center gap-1.5 text-xs text-success-ink"><Check className="size-3.5" /> Live</span>}</td></tr>)}</tbody></table></div>}
    </section><ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => void load()} />
  </MerchantPage>;
}
