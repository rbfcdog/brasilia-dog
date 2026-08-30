"use client";

import { ArrowRight, Bot, Fingerprint, Loader2, Store } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { registerEnrolledPasskey } from "@/hooks/use-passkey";
import { backendService } from "@/services/backend-service";
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
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<{ user: AuthUser; destination: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void authService.session()
      .then(({ user }) => setAuthenticatedEmail(user.email))
      .catch(() => setAuthenticatedEmail(null));
  }, []);

  const destination = role === "buyer" && searchParams.get("next")?.startsWith("/")
    ? searchParams.get("next")!
    : destinations[role];

  async function completeAccess(user: AuthUser) {
    const status = await backendService.passkeyStatus();
    setAuthenticatedEmail(user.email);
    if (!status.registered) {
      setPendingEnrollment({ user, destination });
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function registerFirstPasskey() {
    if (!pendingEnrollment) return;
    setPending(true);
    setMessage("Your device will now ask you to create a passkey.");
    try {
      const result = await registerEnrolledPasskey();
      if (!result.verified) throw new Error("Passkey registration was not verified.");
      router.push(pendingEnrollment.destination);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
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

      if (role === "merchant" && businessName.trim().length < 2) {
        throw new Error("Enter your business name.");
      }
      const data = await authService.signUp({
        email: email.trim(),
        password,
        role,
        ...(role === "merchant" ? { businessName: businessName.trim() } : {}),
      });
      if (data.confirmationRequired) {
        setMessage("Check your email to confirm the account, then sign in here.");
        setMode("signin");
        return;
      }
      if (!data.user) throw new Error("Account creation did not return an active session.");
      await completeAccess(data.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
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
          <button type="button" disabled={pending} onClick={() => void registerFirstPasskey()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-ink disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} Set up passkey
          </button>
          {message ? <p role="alert" className="mt-3 text-xs leading-5 text-danger">{message}</p> : null}
        </div>
      ) : authenticatedEmail ? (
        <div className="mt-5 rounded-2xl border border-white/12 bg-white/[0.07] p-4">
          <p className="text-xs text-white/55">Signed in as</p>
          <p className="mt-1 truncate text-sm font-medium">{authenticatedEmail}</p>
          <button type="button" onClick={() => router.push(destination)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-ink">
            Continue as {role} <ArrowRight className="size-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3 rounded-2xl border border-white/12 bg-white/[0.07] p-4">
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setMode("signin")} className={`rounded-lg px-3 py-1.5 ${mode === "signin" ? "bg-white text-ink" : "text-white/60"}`}>Sign in</button>
            <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-3 py-1.5 ${mode === "signup" ? "bg-white text-ink" : "text-white/60"}`}>Create account</button>
          </div>
          {mode === "signup" ? <div className="flex gap-3 rounded-xl border border-success/30 bg-success/10 p-3 text-xs leading-5 text-white/75"><Fingerprint className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /><p><strong className="text-white">Device passkey required.</strong> After creating your account, set up a passkey here. Your device may use biometrics, a PIN, or another local verifier.</p></div> : null}
          {mode === "signup" && role === "merchant" ? <input aria-label="Business name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Business name" className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-white/35" /> : null}
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
