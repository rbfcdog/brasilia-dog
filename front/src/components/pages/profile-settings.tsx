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
import { createMerchantBrowserClient } from "@/lib/supabase/client";

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
  const [supabaseUser, setSupabaseUser] = useState<{ id: string; email: string; accessToken: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

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
    let supabase;
    try {
      supabase = createMerchantBrowserClient();
    } catch {
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setSupabaseUser(session?.user
        ? { id: session.user.id, email: session.user.email ?? session.user.id, accessToken: session.access_token }
        : null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user
        ? { id: session.user.id, email: session.user.email ?? session.user.id, accessToken: session.access_token }
        : null);
      if (!session) setQrCode(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseUser) return;
    const enrollmentUrl = `${window.location.origin}/profile?enroll=passkey`;
    void QRCode.toDataURL(enrollmentUrl, { width: 220, margin: 2 }).then(setQrCode);
  }, [supabaseUser]);

  async function signInToSupabase() {
    setAuthError(null);
    try {
      const supabase = createMerchantBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Supabase sign-in failed.");
    }
  }

  async function signUpToSupabase() {
    setAuthError(null);
    try {
      const supabase = createMerchantBrowserClient();
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Supabase sign-up failed.");
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
  const identityLabel = supabaseUser?.email ?? "No Supabase user";
  const passkeyUserId = supabaseUser?.id ?? null;
  const passkeyAccessToken = supabaseUser?.accessToken ?? null;
  const accountInitials = supabaseUser?.email.split("@")[0]!.split(/[._-]/)
    .map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{accountInitials}</div>
              <div><h2 className="font-semibold tracking-[-0.02em]">{supabaseUser?.email ?? "Sign in required"}</h2><p className="mt-1 text-sm text-subtle">{identityLabel}</p></div>
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
          <div className="flex items-center gap-3"><LogIn className="size-5 text-primary" /><div><h2 className="font-semibold">Supabase account</h2><p className="mt-0.5 text-xs text-muted">Passkeys and conversations are owned by this user</p></div></div>
          {supabaseUser ? (
            <div className="mt-5">
              <p className="text-sm text-subtle">Signed in as <strong className="text-ink">{supabaseUser.email}</strong></p>
              <button type="button" onClick={() => void createMerchantBrowserClient().auth.signOut()} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs">Sign out of Supabase</button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <input aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-lg border border-line px-3 text-sm" />
              <input aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-line px-3 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => void signInToSupabase()} className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white">Sign in</button>
                <button type="button" onClick={() => void signUpToSupabase()} className="rounded-lg border border-line px-3 py-2 text-xs font-medium">Create account</button>
              </div>
              {authError ? <p role="alert" className="text-xs text-danger">{authError}</p> : null}
            </div>
          )}
        </article>

        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><QrCode className="size-5 text-primary" /><div><h2 className="font-semibold">Enroll another device</h2><p className="mt-0.5 text-xs text-muted">Open the secure Profile enrollment page on your phone</p></div></div>
          {qrCode ? (
            <div className="mt-4 flex items-center gap-4">
              <Image src={qrCode} width={144} height={144} unoptimized alt="QR code linking to passkey enrollment on this site" className="size-36 rounded-lg border border-line" />
              <p className="text-xs leading-5 text-subtle">Scan with your phone, sign into the same Supabase account, then create a passkey on that device. The QR contains only this site&apos;s Profile URL, never a session or credential.</p>
            </div>
          ) : <p className="mt-4 text-sm text-subtle">Sign into Supabase to generate the enrollment QR code.</p>}
        </article>

        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><Fingerprint className="size-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Approval methods</h2><p className="mt-0.5 text-xs text-muted">Controls for high-trust account actions</p></div></div>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <p className="text-sm font-medium">Native WebAuthn biometrics</p>
                  <p className="mt-1 text-xs leading-5 text-subtle">
                    {!supabaseUser
                      ? "Sign into Supabase first. The passkey will be associated with that user."
                      : supported
                        ? "Create or authenticate a passkey associated with your signed-in Supabase user."
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
                  onClick={() => passkeyUserId && passkeyAccessToken
                    ? void test(passkeyUserId, passkeyAccessToken)
                    : undefined}
                  disabled={!supported || !passkeyUserId || !passkeyAccessToken || passkeyState.status === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {passkeyState.status === "loading" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Fingerprint className="size-3.5" aria-hidden="true" />}
                  {passkeyState.status === "loading" ? "Working…" : authenticated ? "Verify passkey" : "Create passkey"}
                </button>
                {authenticated && (
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setSessionState({ kind: "signed_out" });
                    }}
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
      <PaymentSettings />
    </div>
  );
}
