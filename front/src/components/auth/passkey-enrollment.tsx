"use client";

import { Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { authenticateEnrolledPasskey, registerEnrolledPasskey } from "@/hooks/use-passkey";

export function PasskeyEnrollment({ initialError }: { initialError?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(initialError ? "error" : "idle");
  const [message, setMessage] = useState(initialError ? "This passkey enrollment QR is invalid, expired, or already used." : null);
  const supported = typeof window !== "undefined" && "credentials" in navigator;

  async function enroll() {
    setStatus("loading");
    setMessage(null);
    try {
      const result = await registerEnrolledPasskey();
      if (!result.verified) throw new Error("Passkey registration was not verified.");
      setStatus("success");
      setMessage("A new passkey was registered for this user. You can close this page.");
    } catch (error) {
      const isExistingPasskey = typeof error === "object" && error !== null
        && "name" in error
        && error.name === "InvalidStateError";
      if (isExistingPasskey) {
        try {
          const result = await authenticateEnrolledPasskey();
          if (!result.verified) throw new Error("Existing passkey verification was not successful.");
          setStatus("success");
          setMessage("An existing synced passkey was verified for this user. You can close this page.");
          return;
        } catch (authenticationError) {
          setStatus("error");
          setMessage(authenticationError instanceof Error ? authenticationError.message : "Existing passkey verification failed.");
          return;
        }
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-5 text-ink">
      <section className="w-full max-w-md rounded-3xl border border-line bg-white p-7 shadow-xl">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><Fingerprint className="size-6" /></div>
        <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">User-bound passkey enrollment</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Register this device</h1>
        <p className="mt-3 text-sm leading-6 text-subtle">This page can only register one passkey for the specific user who generated the QR. The grant expires in five minutes and is consumed by the first registration attempt.</p>
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-canvas p-3 text-xs leading-5 text-subtle"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-ink" />It cannot open conversations, approve mandates, access payments, or authenticate as the user.</div>
        <button type="button" onClick={() => void enroll()} disabled={!supported || status === "loading" || status === "success" || Boolean(initialError)} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
          {status === "loading" ? "Waiting for device verification…" : status === "success" ? "Passkey registered" : "Register passkey on this device"}
        </button>
        {!supported ? <p className="mt-3 text-xs text-danger">This browser or device does not support WebAuthn passkeys.</p> : null}
        {message ? <p role="status" className={`mt-4 text-sm leading-6 ${status === "error" ? "text-danger" : "text-success-ink"}`}>{message}</p> : null}
        <Link href="/" className="mt-6 block text-center text-xs text-muted hover:text-ink">Return to Vero</Link>
      </section>
    </main>
  );
}
