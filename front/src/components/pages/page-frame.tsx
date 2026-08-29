export function PageFrame({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="h-[calc(100dvh-4rem)] overflow-y-auto bg-canvas lg:h-dvh">
      <div className="dot-grid border-b border-line bg-white/70 px-5 py-9 md:px-8 md:py-12">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] md:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-subtle md:text-base">{description}</p>
          </div>
          {actions}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 py-7 md:px-8 md:py-9">{children}</div>
    </section>
  );
}
