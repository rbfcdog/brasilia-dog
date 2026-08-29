import { ArrowRight, Check, Fingerprint, Radar, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@/components/pages/page-frame";

const steps = [
  { number: "01", title: "Describe the outcome", text: "Tell the assistant what you need in natural language, including the details and price ceiling that matter.", icon: Radar },
  { number: "02", title: "Review the mandate", text: "The assistant converts your request into explicit scope, spend, and validity constraints that cannot silently expand.", icon: ShieldCheck },
  { number: "03", title: "Confirm control", text: "You approve the mandate before the agent can act. This demo uses a simulated identity confirmation.", icon: Fingerprint },
  { number: "04", title: "Receive the record", text: "An eligible offer is purchased immediately or monitored until it qualifies, with a receipt and decision trail.", icon: ReceiptText },
];

export default function SupportPage() {
  return (
    <PageFrame
      eyebrow="Trust by design"
      title="Your agent can shop. You stay in control."
      description="Nomad separates shopping intelligence from financial authority. The agent can recommend and request; the mandate decides what is permitted."
      actions={<Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-mono text-[10px] uppercase tracking-[0.1em] text-white">Try the assistant <ArrowRight className="size-3.5" /></Link>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article key={step.number} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between"><span className="font-mono text-[10px] text-muted">STEP {step.number}</span><span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4.5" /></span></div>
              <h2 className="mt-7 text-xl font-semibold tracking-[-0.035em]">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-subtle">{step.text}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-ink p-6 text-white shadow-sm md:p-8">
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-success">Non-negotiable controls</p>
        <div className="mt-5 grid gap-4 text-sm text-white/70 md:grid-cols-3">
          <p className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> The agent never receives a raw card number.</p>
          <p className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Every request is checked against current mandate state.</p>
          <p className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Failed and challenged attempts remain visible.</p>
        </div>
      </div>
    </PageFrame>
  );
}
