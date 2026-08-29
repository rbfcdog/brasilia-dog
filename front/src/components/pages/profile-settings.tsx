"use client";

import { Bell, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  clearPasskeySessionToken,
  getPasskeySessionToken,
} from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";

type SessionState =
  | { kind: "checking" }
  | { kind: "authenticated"; userId: string }
  | { kind: "signed_out" }
  | { kind: "expired" };

type BackendStatus = "checking" | "available" | "unavailable";


export function ProfileSettings() {
  const [sessionState, setSessionState] = useState<SessionState>({ kind: "checking" });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    void backendService
      .health()
      .then(() => setBackendStatus("available"))
      .catch(() => setBackendStatus("unavailable"));

    const sessionToken = getPasskeySessionToken();
    if (!sessionToken) {
      setSessionState({ kind: "signed_out" });
      return;
    }

    void backendService
      .verifyPasskeySession(sessionToken)
      .then((session) => setSessionState({ kind: "authenticated", userId: session.userId }))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearPasskeySessionToken();
          setSessionState({ kind: "expired" });
          return;
        }
        setSessionState({ kind: "signed_out" });
      });
  }, []);

  const authLabel =
    sessionState.kind === "checking"
      ? "Checking session"
      : sessionState.kind === "authenticated"
        ? "Authenticated"
        : sessionState.kind === "expired"
          ? "Session expired"
          : "Signed out";

  const authenticated = sessionState.kind === "authenticated";
  const identityLabel = authenticated
    ? sessionState.userId
    : "No active passkey session";
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-ink text-sm font-semibold text-white">HL</div>
              <div><h2 className="font-semibold tracking-[-0.02em]">Henrique Lacerda</h2><p className="mt-1 text-sm text-subtle">{identityLabel}</p></div>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${authenticated ? "bg-success/40 text-success-ink" : "bg-canvas text-subtle"}`}>{authLabel}</span>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary"><KeyRound className="size-4" /> Passkey session</div>
            <p className="mt-2 text-sm leading-6 text-subtle">
              {authenticated
                ? "This browser has a verified session with the Node backend."
                : "Authenticate with a passkey before managing agents, mandates, or payment history."}
            </p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              Backend: {backendStatus}
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Fingerprint className="size-5 text-primary" /><div><h2 className="font-semibold">Approval methods</h2><p className="mt-0.5 text-xs text-muted">Controls for high-trust account actions</p></div></div>
          <div className="mt-5 flex items-center justify-between gap-5 rounded-xl border border-line p-4">
            <div><p className="text-sm font-medium">Simulated biometrics</p><p className="mt-1 text-xs leading-5 text-subtle">Enabled for this local demonstration. Native WebAuthn is not invoked.</p></div>
            <span className="rounded-full bg-success/40 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">Active</span>
          </div>
        </article>
      </div>

      <div className="space-y-4">
        <article className="rounded-2xl border border-line bg-ink p-5 text-white shadow-sm">
          <ShieldCheck className="size-5 text-success" />
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">Security boundary</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">The browser can request actions and read permitted projections. It cannot mutate mandates or execute payments directly.</p>
          <div className="mt-5 space-y-3 font-mono text-[9px] uppercase tracking-[0.08em] text-white/65">
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-success" /> No service-role keys</p>
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-success" /> No raw payment credentials</p>
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-success" /> RLS-ready reads only</p>
          </div>
        </article>

        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Bell className="size-5 text-primary" /><div><h2 className="font-semibold">Notifications</h2><p className="mt-0.5 text-xs text-muted">Purchase and mandate updates</p></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-4"><span>Mandate activity</span><input type="checkbox" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Purchase receipts</span><input type="checkbox" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Blocked attempts</span><input type="checkbox" defaultChecked className="size-4 accent-primary" /></label>
          </div>
        </article>
      </div>
    </div>
  );
}
