"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { registerEnrolledPasskey } from "@/hooks/use-passkey";
import { backendService } from "@/services/backend-service";
import { authService } from "@/services/auth-service";

export function MerchantLogin({
  initialError,
  nextPath,
}: {
  initialError?: string;
  nextPath: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(
    initialError === "not_configured"
      ? "Authentication is not configured on the API."
      : "",
  );
  const [confirmation, setConfirmation] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState(false);
  async function beginAccess() {
    const status = await backendService.passkeyStatus();
    if (!status.registered) {
      setPendingEnrollment(true);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  async function enrollFirstPasskey() {
    setPending(true);
    setMessage("Your device will now ask you to create a passkey.");
    try {
      const result = await registerEnrolledPasskey();
      if (!result.verified) throw new Error("Passkey registration was not verified.");
      router.replace(nextPath);
      router.refresh();
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setPending(false);
    }
  }


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const businessName = String(form.get("businessName") ?? "").trim();

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setPending(false);
      return;
    }

    try {
      if (mode === "signin") {
        await authService.signIn(email, password);
        await beginAccess();
      } else {
        if (businessName.length < 2)
          throw new Error("Enter your business name.");
        const data = await authService.signUp({
          email,
          password,
          role: "merchant",
          businessName,
        });
        if (!data.confirmationRequired) {
          if (!data.user) throw new Error("Account creation did not return an active session.");
          await beginAccess();
        } else {
          setConfirmation(true);
        }
      }
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="merchant-grid grid min-h-dvh lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-primary p-10 text-white lg:flex lg:flex-col xl:p-14">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_0.7px,transparent_0.7px)] [background-size:20px_20px]" />
        <Link
          href="/"
          className="relative flex w-fit items-center gap-3 rounded-xl"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white text-primary">
            <Sparkles className="size-4" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-[-0.04em]">
              VERO
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
              Merchant OS
            </span>
          </span>
        </Link>
        <div className="relative my-auto max-w-xl py-16">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
            Fixed-price infrastructure
          </p>
          <h1 className="mt-5 text-5xl font-semibold leading-[.98] tracking-[-0.065em] xl:text-6xl">
            Your storefront, readable by every trusted agent.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/60">
            Publish exact specs, receive mandate-qualified orders, and inspect
            the proof behind every transaction.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {["RLS scoped", "Proof attached", "Server controlled"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs"
                >
                  <CheckCircle2 className="mb-3 size-4 text-success" />
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
        <p className="relative font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">
          Vero commerce protocol · 2026
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 md:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-subtle hover:text-ink lg:hidden">
            <ArrowLeft className="size-3.5" /> Back to Vero
          </Link>
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><Store className="size-4" /></span>
            <div><p className="font-semibold">VERO</p><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Merchant OS</p></div>
          </div>
          {confirmation ? (
            <div className="rounded-2xl border border-line bg-white p-6 text-center shadow-card md:p-8">
              <CheckCircle2 className="mx-auto size-10 text-success-ink" />
              <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">Confirm your email</h1>
              <p className="mt-3 text-sm leading-6 text-subtle">We sent a confirmation link to your work email. After confirming, sign in here to set up your device passkey.</p>
              <button type="button" onClick={() => { setConfirmation(false); setMode("signin"); }} className="mt-7 h-11 w-full rounded-xl bg-primary text-sm font-medium text-white">Back to sign in</button>
            </div>
          ) : pendingEnrollment ? (
            <div className="rounded-2xl border border-line bg-white p-6 shadow-card md:p-8">
              <Fingerprint className="size-8 text-primary" aria-hidden="true" />
              <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">Set up your device passkey</h1>
              <p className="mt-3 text-sm leading-6 text-subtle">One-time storefront setup. Your device may use biometrics, a PIN, or another local verifier. Vero never receives biometric data.</p>
              <button type="button" disabled={pending} onClick={() => void enrollFirstPasskey()} className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-soft disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} Set up passkey
              </button>
              {message ? <p role="alert" className="mt-3 text-xs leading-5 text-danger">{message}</p> : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Merchant access</p>
                  <h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">{mode === "signin" ? "Welcome back" : "Create your storefront"}</h1>
                  <p className="mt-2 text-sm leading-6 text-subtle">{mode === "signin" ? "Sign in to operate your agent-ready catalog." : "Start with a Merchant identity protected by API-enforced ownership."}</p>
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-success-ink"><ShieldCheck className="size-3.5" /> Secure access</span>
              </div>
              <div className="mt-6 grid grid-cols-2 rounded-xl bg-canvas p-1" role="tablist" aria-label="Merchant access mode">
                <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signin" ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Sign in</button>
                <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signup" ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Register</button>
              </div>
              <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
                {mode === "signup" ? <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary-soft p-3 text-xs leading-5 text-subtle"><Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><p><strong className="text-ink">Device passkey required.</strong> After creating your storefront, set up a passkey here using biometrics, a PIN, or another local verifier.</p></div> : null}
                {mode === "signup" ? <label className="block"><span className="text-xs font-medium">Business name</span><input name="businessName" required minLength={2} autoComplete="organization" placeholder="Northstar Supply" className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10" /></label> : null}
                <label className="block"><span className="text-xs font-medium">Work email</span><input name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10" /></label>
                <label className="block"><span className="text-xs font-medium">Password</span><span className="relative mt-2 block"><input name="password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} className="h-11 w-full rounded-xl border border-line bg-white px-3.5 pr-11 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
                {message ? <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-xs leading-5 text-danger">{message}</p> : null}
                <button type="submit" disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-soft transition hover:bg-primary-hover disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : null}{mode === "signin" ? "Enter Merchant OS" : "Create Merchant account"}<ArrowRight className="size-4" /></button>
              </form>
              <p className="mt-5 text-center text-[11px] leading-5 text-muted">First-time accounts set up a passkey here. Catalog and finance commands are authorized by the Node API.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
