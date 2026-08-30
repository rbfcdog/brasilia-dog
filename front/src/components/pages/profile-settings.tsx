"use client";

import { Bell, Fingerprint, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  clearPasskeySessionToken,
  getPasskeySessionToken,
} from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import { usePasskey } from "@/hooks/use-passkey";

type SessionState =
  | { kind: "checking" }
  | { kind: "authenticated"; userId: string }
  | { kind: "signed_out" }
  | { kind: "expired" };

type BackendStatus = "checking" | "available" | "unavailable";

export function ProfileSettings() {
  const [sessionState, setSessionState] = useState<SessionState>({ kind: "checking" });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const { state: passkeyState, test, signOut, supported } = usePasskey();

  useEffect(() => {
    void backendService
      .health()
      .then(() => setBackendStatus("available"))
      .catch(() => setBackendStatus("unavailable"));

    const sessionToken = getPasskeySessionToken();
    if (!sessionToken) {
      queueMicrotask(() => setSessionState({ kind: "signed_out" }));
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

  // Sync passkeyState session changes with sessionState display
  useEffect(() => {
    if (passkeyState.status === "success" && passkeyState.sessionToken && passkeyState.userId) {
      queueMicrotask(() => setSessionState({ kind: "authenticated", userId: passkeyState.userId! }));
    }
  }, [passkeyState.status, passkeyState.sessionToken, passkeyState.userId]);

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

  const testUserId = "test-user-local";
  const testUsername = "Test User";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-ink text-sm font-semibold text-white">HL</div>
              <div><h2 className="font-semibold tracking-[-0.02em]">Henrique Lacerda</h2><p className="mt-1 text-sm text-subtle">{identityLabel}</p></div>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${authenticated ? "bg-success/40 text-success-ink" : "bg-canvas text-subtle"}`}>{authLabel}</span>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary"><KeyRound className="size-4" aria-hidden="true" /> Passkey session</div>
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

      <article className="h-full rounded-2xl border border-primary/15 bg-primary-soft p-5 text-ink shadow-sm">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">Security boundary</h2>
          <p className="mt-2 text-sm leading-6 text-subtle">The browser can request actions and read permitted projections. It cannot mutate mandates or execute payments directly.</p>
          <div className="mt-5 space-y-3 font-mono text-[9px] uppercase tracking-[0.08em] text-subtle">
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" /> No service-role keys</p>
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" /> No raw payment credentials</p>
            <p className="flex items-center gap-2"><LockKeyhole className="size-3.5 text-primary" aria-hidden="true" /> RLS-ready reads only</p>
          </div>
      </article>

      <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Fingerprint className="size-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Approval methods</h2><p className="mt-0.5 text-xs text-muted">Controls for high-trust account actions</p></div></div>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <p className="text-sm font-medium">Native WebAuthn biometrics</p>
                  <p className="mt-1 text-xs leading-5 text-subtle">
                    {supported
                      ? "Test device biometric verification. The first test registers a passkey; later tests authenticate with it."
                      : "WebAuthn is not supported in this browser."}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase ${authenticated ? "bg-success/40 text-success-ink" : "bg-canvas text-subtle"}`}>
                  {authenticated ? "Active" : supported ? "Ready" : "N/A"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void test(testUserId, testUsername)}
                  disabled={!supported || passkeyState.status === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passkeyState.status === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Fingerprint className="size-3.5" aria-hidden="true" />}
                  Test biometry
                </button>
                {authenticated && (
                  <button
                    type="button"
                    onClick={signOut}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas"
                  >
                    Sign out
                  </button>
                )}
              </div>
              {passkeyState.message && (
                <p className={`mt-3 text-xs leading-5 ${passkeyState.status === "error" ? "text-danger" : passkeyState.status === "success" ? "text-success-ink" : "text-subtle"}`}>
                  {passkeyState.message}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-5 rounded-xl border border-line p-4">
              <div><p className="text-sm font-medium">Mandate approval</p><p className="mt-1 text-xs leading-5 text-subtle">Purchase mandates require a fresh native WebAuthn passkey verification. There is no simulated approval fallback.</p></div>
              <span className="rounded-full bg-success/40 px-2.5 py-1 font-mono text-[9px] uppercase text-success-ink">Passkey required</span>
            </div>
          </div>
      </article>

      <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Bell className="size-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Notifications</h2><p className="mt-0.5 text-xs text-muted">Purchase and mandate updates</p></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-4"><span>Mandate activity</span><input type="checkbox" name="mandateActivity" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Purchase receipts</span><input type="checkbox" name="purchaseReceipts" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Blocked attempts</span><input type="checkbox" name="blockedAttempts" defaultChecked className="size-4 accent-primary" /></label>
          </div>
      </article>
    </div>
  );
}
