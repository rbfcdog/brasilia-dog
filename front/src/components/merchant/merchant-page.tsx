export function MerchantPage({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="merchant-grid min-h-full">
      <header className="border-b border-black/[0.08] bg-white/85 px-5 py-7 backdrop-blur md:px-8 md:py-9">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.17em] text-primary">{eyebrow}</p><h1 className="mt-2.5 text-3xl font-semibold tracking-[-0.05em] md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-subtle">{description}</p></div>
          {action}
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-8 md:py-8">{children}</div>
    </main>
  );
}
