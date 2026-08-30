"use client";

import { Bell, Fingerprint, KeyRound, Loader2, LockKeyhole, LogIn, QrCode, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import Image from "next/image";
import { useEffect, useState } from "react";
import { PaymentSettings } from "@/components/pages/payment-settings";
import { ApiError } from "@/lib/api";
import {
  clearPasskeySessionToken,
  getPasskeySessionToken,
} from "@/lib/passkey-session";
import { backendService } from "@/services/backend-service";
import { usePasskey } from "@/hooks/use-passkey";
import { authService } from "@/services/auth-service";

type SessionState =
  | { kind: "checking" }
  | { kind: "authenticated"; userId: string }
  | { kind: "signed_out" }
  | { kind: "expired" };

type BackendStatus = "checking" | "available" | "unavailable";

export function ProfileSettings() {
  const [sessionState, setSessionState] = useState<SessionState>({ kind: "checking" });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const { state: passkeyState, register, authenticate, signOut, supported } = usePasskey();
  const [accountUser, setAccountUser] = useState<{ id: string; email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrRequest, setQrRequest] = useState(0);

  function setSignedInAccount(user: { id: string; email?: string | null }) {
    setQrCode(null);
    setQrError(null);
    setQrLoading(true);
    setAccountUser({ id: user.id, email: user.email ?? user.id });
  }

  function requestNewQr() {
    setQrCode(null);
    setQrError(null);
    setQrLoading(true);
    setQrRequest((value) => value + 1);
  }

  useEffect(() => {
    void backendService
      .health()
      .then(() => setBackendStatus("available"))
      .catch(() => setBackendStatus("unavailable"));

    const sessionToken = getPasskeySessionToken();
    if (!sessionToken) {
      const frame = window.requestAnimationFrame(() => setSessionState({ kind: "signed_out" }));
      return () => window.cancelAnimationFrame(frame);
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

  useEffect(() => {
    void authService.session()
      .then(({ user }) => setSignedInAccount(user))
      .catch(() => setAccountUser(null));
  }, []);

  useEffect(() => {
    if (!accountUser) return;
    let cancelled = false;
    void fetch("/api/passkey/enrollment", { method: "POST", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { enrollmentUrl?: string; detail?: string; error?: string };
        if (!response.ok || !payload.enrollmentUrl) throw new Error(payload.detail ?? payload.error ?? "Could not create enrollment QR.");
        return QRCode.toDataURL(payload.enrollmentUrl, { width: 220, margin: 2 });
      })
      .then((code) => { if (!cancelled) setQrCode(code); })
      .catch((error) => {
        if (!cancelled) setQrError(error instanceof Error ? error.message : "Could not create enrollment QR.");
      })
      .finally(() => { if (!cancelled) setQrLoading(false); });
    return () => { cancelled = true; };
  }, [accountUser, qrRequest]);

  async function signInToAccount() {
    setAuthError(null);
    try {
      const { user } = await authService.signIn(email.trim(), password);
      setSignedInAccount(user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  async function signUpAccount() {
    setAuthError(null);
    try {
      const result = await authService.signUp({ email: email.trim(), password, role: "buyer" });
      if (result.confirmationRequired) {
        setAuthError("Check your email to confirm the account, then sign in.");
      } else if (result.user) {
        setSignedInAccount(result.user);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Account creation failed.");
    }
  }

  const displayedSessionState: SessionState =
    passkeyState.status === "success" && passkeyState.sessionToken && passkeyState.userId
      ? { kind: "authenticated", userId: passkeyState.userId }
      : sessionState;

  const authLabel =
    displayedSessionState.kind === "checking"
      ? "Checking session"
      : displayedSessionState.kind === "authenticated"
        ? "Authenticated"
        : displayedSessionState.kind === "expired"
          ? "Session expired"
          : "Signed out";

  const authenticated = displayedSessionState.kind === "authenticated";
  const identityLabel = accountUser?.email ?? "No authenticated user";
  const passkeyUserId = accountUser?.id ?? null;
  const accountInitials = accountUser?.email.split("@")[0]!.split(/[._-]/)
    .map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{accountInitials}</div>
              <div><h2 className="font-semibold tracking-[-0.02em]">{accountUser?.email ?? "Sign in required"}</h2><p className="mt-1 text-sm text-subtle">{identityLabel}</p></div>
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
          <div className="flex items-center gap-3"><LogIn className="size-5 text-primary" /><div><h2 className="font-semibold">Account</h2><p className="mt-0.5 text-xs text-muted">Passkeys and conversations are owned by this user</p></div></div>
          {accountUser ? (
            <div className="mt-5">
              <p className="text-sm text-subtle">Signed in as <strong className="text-ink">{accountUser.email}</strong></p>
              <button type="button" onClick={() => void authService.signOut().then(() => { setAccountUser(null); setQrCode(null); setQrError(null); setQrLoading(false); })} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs">Sign out</button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-lg border border-line px-3 text-sm" />
              <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-line px-3 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => void signInToAccount()} className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white">Sign in</button>
                <button type="button" onClick={() => void signUpAccount()} className="rounded-lg border border-line px-3 py-2 text-xs font-medium">Create account</button>
              </div>
              {authError ? <p role="alert" className="text-xs text-danger">{authError}</p> : null}
            </div>
          )}
        </article>

        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><QrCode className="size-5 text-primary" /><div><h2 className="font-semibold">Enroll another device</h2><p className="mt-0.5 text-xs text-muted">Single-use passkey registration for this user only</p></div></div>
          {qrCode ? (
            <div className="mt-4 flex items-center gap-4">
              <Image src={qrCode} width={144} height={144} unoptimized alt="QR code linking to passkey enrollment on this site" className="size-36 rounded-lg border border-line" />
              <div>
                <p className="text-xs leading-5 text-subtle">Scan with the device that should receive the passkey. This user-bound QR expires in five minutes, works once, and opens only the dedicated passkey registration endpoint.</p>
                <button type="button" onClick={requestNewQr} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs">Generate a new QR</button>
              </div>
            </div>
          ) : !accountUser ? (
            <p className="mt-4 text-sm text-subtle">Sign in to the account above to generate its passkey enrollment QR.</p>
          ) : qrLoading || !qrError ? (
            <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-subtle"><Loader2 className="size-4 animate-spin" />Generating secure enrollment QR…</p>
          ) : (
            <div className="mt-4">
              <p role="alert" className="text-sm text-danger">{qrError ?? "The enrollment QR could not be generated."}</p>
              <button type="button" onClick={requestNewQr} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs">Retry QR generation</button>
            </div>
          )}
        </article>

        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Fingerprint className="size-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Approval methods</h2><p className="mt-0.5 text-xs text-muted">Controls for high-trust account actions</p></div></div>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <p className="text-sm font-medium">Native WebAuthn biometrics</p>
                  <p className="mt-1 text-xs leading-5 text-subtle">
                    {!accountUser ? "Sign in first. Passkeys are associated with that account." : supported ? "Authenticate with any passkey already registered to this account, including one on your phone. Register this device only when you want an additional passkey here." : "WebAuthn is not supported in this browser."}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase ${authenticated ? "bg-success/40 text-success-ink" : "bg-canvas text-subtle"}`}>{authenticated ? "Active" : supported ? "Ready" : "N/A"}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => passkeyUserId ? void authenticate(passkeyUserId) : undefined} disabled={!supported || !passkeyUserId || passkeyState.status === "loading"} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50">
                  {passkeyState.status === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Fingerprint className="size-3.5" aria-hidden="true" />}
                  {passkeyState.status === "loading" ? "Working…" : authenticated ? "Verify passkey" : "Authenticate with passkey"}
                </button>
                <button type="button" onClick={() => passkeyUserId ? void register(passkeyUserId) : undefined} disabled={!supported || !passkeyUserId || passkeyState.status === "loading"} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50">
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  Register this device
                </button>
                {authenticated ? <button type="button" onClick={() => { signOut(); setSessionState({ kind: "signed_out" }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-canvas">Sign out passkey</button> : null}
              </div>
              {passkeyState.message ? <p className={`mt-3 text-xs leading-5 ${passkeyState.status === "error" ? "text-danger" : passkeyState.status === "success" ? "text-success-ink" : "text-subtle"}`}>{passkeyState.message}</p> : null}
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
      <PaymentSettings />
    </div>
  );
}
