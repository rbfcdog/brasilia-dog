"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Monitor,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { AgentActivity } from "@/components/chat/agent-activity";
import { BiometricDialog } from "@/components/chat/biometric-dialog";
import { ChatComposer } from "@/components/chat/chat-composer";
import { MandateCard } from "@/components/chat/mandate-card";
import { MarketplaceListings } from "@/components/chat/marketplace-listings";
import { ProductDiscovery } from "@/components/chat/product-discovery";
import { ReceiptCard } from "@/components/chat/receipt-card";
import { ScheduledResultCard } from "@/components/chat/scheduled-card";
import { useAIShopping } from "@/hooks/use-ai-shopping";

const suggestions = [
  {
    label: "Buy now",
    prompt: "Buy an ultrawide monitor up to $300",
    note: "Best qualifying offer",
  },
  {
    label: "Clarify request",
    prompt: "Find me a monitor",
    note: "Agent asks for details",
  },
  {
    label: "Keep monitoring",
    prompt: "Track a 34-inch ultrawide monitor under $220",
    note: "Schedule the mandate",
  },
];

export function ChatExperience() {
  const {
    state,
    sendMessage,
    requestApproval,
    updateMandate,
    confirmApproval,
    cancelApproval,
    reset,
    dismissToast,
  } = useAIShopping();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.status, state.messages.length]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = window.setTimeout(dismissToast, 4_500);
    return () => window.clearTimeout(timer);
  }, [dismissToast, state.toast]);

  const composerDisabled = [
    "analyzing",
    "mandate_ready",
    "biometric_confirmation",
    "searching",
  ].includes(state.status);
  const composerPlaceholder = state.status === "mandate_ready"
    ? "Approve the mandate or start a new request"
    : state.status === "searching"
      ? "Your agent is searching verified merchants…"
      : "Describe what you want to buy…";

  return (
    <section className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-canvas lg:h-dvh">
      <header className="flex h-17 shrink-0 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur-md md:px-7">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold tracking-[-0.025em]">Shopping Agent</h1>
            <span className="relative flex size-2" aria-label="Online"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success-ink/30 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-success-ink" /></span>
          </div>
          <p className={`mt-0.5 text-xs ${state.storage === "unavailable" ? "text-danger" : "text-subtle"}`}>
            {state.storage === "backend"
              ? "Conversation saved to the backend"
              : "Backend persistence unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-success/70 bg-success/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-success-ink sm:inline-flex">
            Control layer active
          </span>
          {state.messages.length > 0 ? (
            <button onClick={reset} className="grid size-9 place-items-center rounded-lg border border-line bg-white text-subtle transition hover:text-ink" aria-label="Reset conversation">
              <RotateCcw className="size-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="dot-grid min-h-0 flex-1 overflow-y-auto" aria-label="Conversation">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 md:px-6 md:py-10">
          {state.messages.length === 0 && state.hydrated ? (
            <div className="my-auto py-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary-soft text-primary shadow-soft">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-7 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Autonomous buying, governed by you</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">What can I buy for you?</h2>
              <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-6 text-subtle sm:text-base">
                Tell your agent what you need. It can search and purchase within the exact permissions you approve.
              </p>
              <div className="mx-auto mt-8 grid max-w-2xl gap-2.5 text-left md:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => void sendMessage(suggestion.prompt)}
                    className="group rounded-xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md active:translate-y-0 motion-reduce:transform-none"
                  >
                    <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary">
                      {suggestion.label === "Keep monitoring" ? <Clock3 className="size-3.5" /> : <Monitor className="size-3.5" />}
                      {suggestion.label}
                    </span>
                    <span className="mt-3 block text-sm font-medium leading-5">{suggestion.prompt}</span>
                    <span className="mt-2 block text-[11px] text-muted">{suggestion.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {state.messages.length > 0 ? (
            <div className="space-y-6">
              {state.messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex items-start gap-3"}>
                  {message.role === "assistant" ? (
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-white">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                    </div>
                  ) : null}
                  <div className={message.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-white shadow-sm sm:max-w-[70%]"
                    : "max-w-2xl pt-1 text-[15px] leading-7 text-ink"}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {state.status === "analyzing" || state.status === "searching" ? <AgentActivity status={state.status} /> : null}

              {state.mandate ? (
                <MandateCard mandate={state.mandate} status={state.status} onApprove={requestApproval} onUpdate={updateMandate} />
              ) : null}

              {state.discoveredProducts.length > 0 ? <ProductDiscovery products={state.discoveredProducts} activity={state.catalogActivity} /> : null}

              {state.listings.length > 0 ? <MarketplaceListings listings={state.listings} /> : null}

              {state.receipt ? <ReceiptCard receipt={state.receipt} /> : null}
              {state.scheduledPurchase ? <ScheduledResultCard purchase={state.scheduledPurchase} /> : null}

              {state.paymentChallenge ? (
                <div role="alert" className="sm:ml-10 max-w-xl rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning-ink">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Payment challenge intercepted</div>
                  <p className="mt-2 leading-6">{state.paymentChallenge.message} The challenge was logged without exposing credential details.</p>
                </div>
              ) : null}

              {state.error ? (
                <div role="alert" className="sm:ml-10 max-w-xl rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> Request interrupted</div>
                  <p className="mt-2 text-ink">{state.error}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <ChatComposer onSend={sendMessage} disabled={composerDisabled} placeholder={composerPlaceholder} />

      <BiometricDialog
        open={state.status === "biometric_confirmation"}
        onCancel={cancelApproval}
        onConfirm={confirmApproval}
      />

      {state.toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-24 right-4 z-40 flex max-w-sm items-center gap-3 rounded-xl border border-success/70 bg-success px-4 py-3 text-sm font-medium text-success-ink shadow-xl md:right-7">
          <span className="grid size-6 place-items-center rounded-full bg-white/65"><Check className="size-4" /></span>
          <span>{state.toast}</span>
          <button onClick={dismissToast} className="ml-2 grid size-7 place-items-center rounded-lg hover:bg-white/40" aria-label="Dismiss notification"><X className="size-3.5" /></button>
        </div>
      ) : null}
    </section>
  );
}
