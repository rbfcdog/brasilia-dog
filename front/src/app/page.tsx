import {
  ArrowRight,
  CheckCircle2,
  Database,
  Fingerprint,
  Gauge,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { WorkspaceAuth } from "@/components/auth/workspace-auth";

const principles = [
  { icon: Database, label: "Structured facts", detail: "Exact specs agents can query" },
  { icon: Gauge, label: "One fixed price", detail: "Set once by the merchant" },
  { icon: ShieldCheck, label: "Mandate matched", detail: "Accepted only inside the ceiling" },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#f7f7f5] text-ink">
      <div className="landing-grid relative isolate">
        <div className="pointer-events-none absolute -left-40 top-24 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-72 size-80 rounded-full bg-success/25 blur-3xl" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-xl" aria-label="Nomad home">
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-white shadow-sm">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold leading-none tracking-[-0.04em]">NOMAD</span>
              <span className="mt-1.5 block font-mono text-[9px] uppercase leading-none tracking-[0.18em] text-muted">Agentic commerce</span>
            </span>
          </Link>
          <Link href="#workspace-auth" className="hidden items-center gap-2 rounded-xl border border-black/[0.08] bg-white/80 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur transition hover:border-primary/25 hover:text-primary sm:inline-flex">
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </nav>

        <section className="relative z-[1] mx-auto grid min-h-[calc(100dvh-80px)] max-w-7xl items-center gap-12 px-5 pb-14 pt-10 md:px-8 lg:grid-cols-[1.06fr_.94fr] lg:gap-16 lg:pb-20 lg:pt-14">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-soft px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-primary">
              <span className="size-1.5 rounded-full bg-success-ink" /> Fixed-price agent economy
            </div>
            <h1 className="mt-7 text-balance text-[clamp(3.2rem,7vw,6.6rem)] font-semibold leading-[0.91] tracking-[-0.075em]">
              Commerce for people <span className="text-primary">and their agents.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-subtle md:text-lg md:leading-8">
              Buyers define the mandate. Merchants publish exact product data and one fixed price. Nomad turns that agreement into a verifiable purchase.
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {principles.map(({ icon: Icon, label, detail }, index) => (
                <div key={label} className="rounded-2xl border border-black/[0.08] bg-white/75 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center justify-between">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    <span className="font-mono text-[9px] text-muted">0{index + 1}</span>
                  </div>
                  <p className="mt-4 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-subtle">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="workspace-auth" className="relative mx-auto w-full max-w-xl scroll-mt-6">
            <div className="absolute -inset-3 rotate-2 rounded-[28px] border border-primary/15 bg-primary/5" />
            <div className="relative rounded-[26px] border border-black/[0.08] bg-white p-3 shadow-[0_30px_90px_rgb(16_17_20/0.14)]">
              <WorkspaceAuth />

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-success-ink" /> No auctions</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-success-ink" /> One clear price</span>
                <span className="flex items-center gap-1.5"><Fingerprint className="size-3 text-primary" /> Proof attached</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
