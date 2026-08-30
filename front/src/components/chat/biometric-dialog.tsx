"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Fingerprint, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { BiometricApprovalMode } from "@/types/shopping";

export function BiometricDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (mode: BiometricApprovalMode) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<BiometricApprovalMode | null>(null);

  async function confirm(mode: BiometricApprovalMode) {
    setConfirming(mode);
    try {
      await onConfirm(mode);
    } finally {
      setConfirming(null);
    }
  }

  const busy = confirming !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-ink p-6 text-white shadow-2xl focus:outline-none data-[state=open]:animate-dialog-in">
          <Dialog.Title className="text-xl font-semibold tracking-[-0.035em]">Confirm your identity</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-white/60">
            Confirm this mandate with your device passkey. The browser performs verification locally; biometric data never leaves your device.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button disabled={busy} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close approval dialog">
              <X className="size-4" />
            </button>
          </Dialog.Close>

          <div className="my-7 grid place-items-center">
            <div className="relative grid size-24 place-items-center rounded-full border border-primary/50 bg-primary/10 text-primary-light">
              {busy ? <span className="absolute inset-2 animate-ping rounded-full border border-primary/30 motion-reduce:animate-none" /> : null}
              <Fingerprint className="size-11" strokeWidth={1.3} />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/65">
            <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" /> Scope and maximum amount are locked.</p>
            <p className="flex items-center gap-2"><LockKeyhole className="size-4 text-success" /> Payment credentials remain unavailable to the agent.</p>
          </div>

          <button
            onClick={() => void confirm("passkey")}
            disabled={busy}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-success px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-success-ink transition hover:bg-success/90 disabled:cursor-wait"
          >
            {confirming === "passkey" ? "Verifying identity…" : "Confirm with passkey"}
          </button>
          <button
            onClick={() => void confirm("demo")}
            disabled={busy}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75 transition hover:bg-white/10 disabled:cursor-wait"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {confirming === "demo" ? "Verifying demo identity…" : "Confirm with demo passkey"}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/40">The demo passkey verifies a sandbox identity without WebAuthn.</p>
          <button onClick={onCancel} disabled={busy} className="mt-2 h-10 w-full text-xs text-white/55 hover:text-white">
            Cancel
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
