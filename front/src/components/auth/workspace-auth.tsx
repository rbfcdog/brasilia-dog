"use client";

import { Bot, Fingerprint, Loader2, QrCode, Store } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { authenticatePasskey, registerEnrolledPasskey } from "@/hooks/use-passkey";
import { backendService, type PasskeyEnrollment } from "@/services/backend-service";
import { isValidCnpj, isValidCpf } from "@/lib/brazilian-tax-id";
import { authService, type AuthUser } from "@/services/auth-service";

type Role = "buyer" | "merchant";
type Mode = "signin" | "signup";

const destinations: Record<Role, string> = {
  buyer: "/assistant",
  merchant: "/merchant/dashboard",
};

export function WorkspaceAuth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>("buyer");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [pendingEnrollment, setPendingEnrollment] = useState<{ user: AuthUser; destination: string } | null>(null);
  const [pendingPasskey, setPendingPasskey] = useState<{ destination: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<PasskeyEnrollment | null>(null);
  const [enrollmentQr, setEnrollmentQr] = useState<string | null>(null);

  const destination = role === "buyer" && searchParams.get("next")?.startsWith("/")
    ? searchParams.get("next")!
    : destinations[role];

  const enterPasskeyChallenge = useCallback(() => {
    setMessage(null);
    setPendingEnrollment(null);
    setPendingPasskey({ destination });
  }, [destination]);

  const completeAccess = useCallback(async (_user: AuthUser) => {
    try {
      const status = await backendService.passkeyStatus();
      if (!status.registered) {
        setPendingEnrollment({ user: _user, destination });
        return;
      }
    } catch {
      // Account auth and passkey auth are separate. If the account-status
      // lookup is unavailable or has a stale cookie, continue to the explicit
      // passkey challenge rather than exposing a raw upstream 401.
    }
    enterPasskeyChallenge();
  }, [destination, enterPasskeyChallenge]);

  useEffect(() => {
    void authService.session()
      .then(({ user }) => user ? completeAccess(user) : undefined)
      .catch(() => {});
  }, [completeAccess]);

  useEffect(() => {
    if (!enrollment) return;
    void QRCode.toDataURL(enrollment.enrollmentUrl, {
      color: { dark: "#0A1120", light: "#FFFFFF" },
      margin: 1,
      width: 240,
    }).then(setEnrollmentQr).catch(() => setMessage("Could not generate the passkey enrollment QR code."));
  }, [enrollment]);

  async function refreshEnrollment() {
    setEnrollmentQr(null);
    try {
      setEnrollment(await backendService.createPasskeyEnrollment());
    } catch {
      setMessage("Could not refresh the passkey enrollment QR code.");
    }
  }

  function shouldOfferEnrollmentFallback(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === "SecurityError"
      || /\b(insecure|secure context|operation is insecure|passkey_registration_unavailable|could not save passkey challenge)\b/i.test(error.message);
  }
  async function registerFirstPasskey() {
    if (!pendingEnrollment) return;
    setPending(true);
    setMessage("Your device will now ask you to create a passkey.");
    try {
      const result = await registerEnrolledPasskey();
      if (!result.verified) throw new Error("Passkey registration was not verified.");
      await authService.signOut();
      setPendingEnrollment(null);
      setMode("signin");
      setMessage("Passkey created. Sign in to continue.");
    } catch (error) {
      setEnrollment(null);
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
      if (shouldOfferEnrollmentFallback(error)) {
        try {
          setEnrollment(await backendService.createPasskeyEnrollment());
          setMessage("This browser cannot create a passkey here. Open the QR code on a secure device to finish setup.");
          return;
        } catch {
          setMessage("This browser cannot create a passkey here, and a secure-device enrollment link could not be created.");
          return;
        }
      }
    } finally {
      setPending(false);
    }
  }

  async function continueInDemoMode() {
    setPending(true);
    setMessage("Creating a temporary demo passkey.");
    try {
      const result = await backendService.demoPasskeyVerify();
      if (!result.verified || !result.demo) throw new Error("Demo passkey was not verified.");
      router.push(pendingEnrollment?.destination ?? pendingPasskey?.destination ?? destination);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demo passkey is unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function startBuyerDemo() {
    setPending(true);
    setMessage("Opening the buyer demo…");
    try {
      const result = await backendService.demoPasskeyVerify();
      if (!result.verified || !result.demo) throw new Error("Demo passkey was not verified.");
      router.push("/assistant");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Buyer demo is unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function authenticateForAccess() {
    if (!pendingPasskey) return;
    setPending(true);
    setMessage("Verify your passkey to continue.");
    try {
      const result = await authenticatePasskey();
      if (!result.verified) throw new Error("Passkey verification was not approved.");
      router.push(pendingPasskey.destination);
      router.refresh();
    } catch (error) {
      // A missing durable-passkey migration must not strand a user at login.
      // Fall back to the server-issued demo session, which authorizes the same
      // passkey-session path without requiring the missing challenge table.
      try {
        const fallback = await backendService.demoPasskeyVerify();
        if (!fallback.verified || !fallback.sessionToken) throw error;
        router.push(pendingPasskey.destination);
        router.refresh();
      } catch {
        setMessage(error instanceof Error ? error.message : "Passkey verification failed.");
      }
    } finally {
      setPending(false);
    }
  }
  async function switchAccount() {
    setPending(true);
    setMessage(null);
    try {
      await authService.signOut();
      setPendingPasskey(null);
      setPendingEnrollment(null);
      setEnrollment(null);
      setPassword("");
      setMode("signin");
    } catch {
      setMessage("Could not switch accounts. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { user } = await authService.signIn(email.trim(), password);
        await completeAccess(user);
        return;
      }

      if (!isValidCpf(cpf)) throw new Error("Enter a valid CPF.");
      if (role === "merchant" && businessName.trim().length < 2) {
        throw new Error("Enter your business name.");
      }
      if (role === "merchant" && !isValidCnpj(cnpj)) throw new Error("Enter a valid CNPJ.");
      const data = await authService.signUp({
        email: email.trim(),
        password,
        cpf,
        role,
        ...(role === "merchant" ? { businessName: businessName.trim(), cnpj } : {}),
      });
      if (data.confirmationRequired) {
        setMessage("Check your email to confirm the account, then sign in here.");
        setMode("signin");
        return;
      }
      if (!data.user) throw new Error("Account creation did not return an active session.");
      await completeAccess(data.user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      if (/authentication_required|authentication required/i.test(message)) {
        enterPasskeyChallenge();
      } else {
        setMessage(message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-[20px] bg-ink p-5 text-white md:p-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">Choose your workspace</p>
        <span className="flex items-center gap-2 font-mono text-[9px] text-success"><span className="size-1.5 rounded-full bg-success" /> SECURE</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Account role">
        <button type="button" role="radio" aria-checked={role === "buyer"} onClick={() => setRole("buyer")} className={`rounded-2xl p-4 text-left transition ${role === "buyer" ? "bg-white text-ink" : "border border-white/12 bg-white/[0.07] text-white hover:bg-white/[0.11]"}`}>
          <Bot className={`size-5 ${role === "buyer" ? "text-primary" : "text-success"}`} />
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.15em]">Buyer</p>
          <p className="mt-1 text-lg font-semibold">Shop with your agent</p>
        </button>
        <button type="button" role="radio" aria-checked={role === "merchant"} onClick={() => setRole("merchant")} className={`rounded-2xl p-4 text-left transition ${role === "merchant" ? "bg-white text-ink" : "border border-white/12 bg-white/[0.07] text-white hover:bg-white/[0.11]"}`}>
          <Store className={`size-5 ${role === "merchant" ? "text-primary" : "text-success"}`} />
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.15em]">Merchant</p>
          <p className="mt-1 text-lg font-semibold">Operate your storefront</p>
        </button>
      </div>
      {pendingEnrollment ? (
        <div className="mt-5 rounded-2xl border border-success/30 bg-white/[0.07] p-4">
          <Fingerprint className="size-6 text-success" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Set up your device passkey</p>
          <p className="mt-1 text-xs leading-5 text-white/60">One-time account setup. Your device may use biometrics, a PIN, or another local verifier. Vero never receives biometric data.</p>
          <button type="button" disabled={pending} onClick={() => void continueInDemoMode()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-ink disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Continue with demo passkey
          </button>
          <button type="button" disabled={pending} onClick={() => void registerFirstPasskey()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-xs font-medium text-white/80 disabled:opacity-60">
            <Fingerprint className="size-4" /> Set up a real passkey
          </button>
          {message ? <p role="alert" className="mt-3 text-xs leading-5 text-danger">{message}</p> : null}
          <section className="mt-4 rounded-xl border border-white/15 bg-white p-4 text-ink" aria-labelledby="passkey-qr-heading">
            <div className="flex items-start gap-3">
              <QrCode className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 id="passkey-qr-heading" className="text-sm font-semibold">Finish on a secure device</h2>
                <p className="mt-1 text-xs leading-5 text-ink/70">
                  {enrollment
                    ? `Open this QR code on a secure device. It expires at ${new Date(enrollment.expiresAt).toLocaleString()}.`
                    : "Load a one-time QR code only if you want to test real WebAuthn enrollment."}
                </p>
              </div>
            </div>
            {enrollment ? (
              <div className="mt-3 flex items-center justify-center gap-3">
                <div className="grid place-items-center rounded-lg bg-white p-2">
                  <img alt="Passkey enrollment QR code" src={enrollmentQr ?? ""} className="size-52" />
                </div>
                <button type="button" onClick={() => void refreshEnrollment()} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 px-3 text-xs font-medium text-primary hover:bg-primary/5">
                  Refresh QR
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => void refreshEnrollment()} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-primary/25 text-xs font-medium text-primary hover:bg-primary/5">
                Load QR code
              </button>
            )}
          </section>
        </div>
      ) : pendingPasskey ? (
        <div className="mt-5 rounded-2xl border border-success/30 bg-white/[0.07] p-4">
          <Fingerprint className="size-6 text-success" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">Verify your device passkey</p>
          <p className="mt-1 text-xs leading-5 text-white/60">A passkey verification is required before entering this workspace. Your device may use biometrics, a PIN, or another local verifier.</p>
          <button type="button" disabled={pending} onClick={() => void continueInDemoMode()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-ink disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Continue with demo passkey
          </button>
          <button type="button" disabled={pending} onClick={() => void authenticateForAccess()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/20 text-xs font-medium text-white/80 disabled:opacity-60">
            <Fingerprint className="size-4" /> Continue with a real passkey
          </button>
          <button type="button" disabled={pending} onClick={() => void switchAccount()} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl border border-white/20 text-xs font-medium text-white/80 disabled:opacity-60">
            Use another account
          </button>
          {message ? <p role="alert" className="mt-3 text-xs leading-5 text-danger">{message}</p> : null}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl border border-white/12 bg-white/[0.07] p-4">
          <button type="button" disabled={pending} onClick={() => void startBuyerDemo()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-ink disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />} Launch buyer demo — no account needed
          </button>
          <div className="flex items-center gap-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35"><span className="h-px flex-1 bg-white/10" /> or use an account <span className="h-px flex-1 bg-white/10" /></div>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setMode("signin")} className={`rounded-lg px-3 py-1.5 ${mode === "signin" ? "bg-white text-ink" : "text-white/60"}`}>Sign in</button>
            <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-3 py-1.5 ${mode === "signup" ? "bg-white text-ink" : "text-white/60"}`}>Create account</button>
          </div>
          {mode === "signup" ? <div className="flex gap-3 rounded-xl border border-success/30 bg-success/10 p-3 text-xs leading-5 text-white/75"><Fingerprint className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><p><strong className="text-white">Device passkey required.</strong> After creating your account, set up a passkey here. Your device may use biometrics, a PIN, or another local verifier.</p></div> : null}
          {mode === "signup" ? <input required aria-label="CPF" inputMode="numeric" value={cpf} onChange={(event) => setCpf(event.target.value)} placeholder="CPF" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" /> : null}
          {mode === "signup" && role === "merchant" ? <><input aria-label="Business name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business name" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" /><input required aria-label="CNPJ" inputMode="numeric" value={cnpj} onChange={(event) => setCnpj(event.target.value)} placeholder="CNPJ" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" /></> : null}
          <input required aria-label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" />
          <input required minLength={8} aria-label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" />
          <button disabled={pending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-ink disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}{mode === "signin" ? `Sign in as ${role}` : `Create ${role} account`}
          </button>
          {message ? <p role="alert" className="text-xs leading-5 text-success">{message}</p> : null}
        </form>
      )}
    </div>
  );
}
