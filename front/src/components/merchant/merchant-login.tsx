"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createMerchantBrowserClient } from "@/lib/supabase/client";

export function MerchantLogin({
  initialError,
  nextPath,
  mockMode = false,
}: {
  initialError?: string;
  nextPath: string;
  mockMode?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(
    !mockMode && initialError === "not_configured"
      ? "Merchant authentication is not configured. Add the public Supabase environment values to continue."
      : "",
  );
  const [confirmation, setConfirmation] = useState(false);

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
      const supabase = createMerchantBrowserClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(nextPath);
        router.refresh();
      } else {
        if (businessName.length < 2)
          throw new Error("Enter your business name.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { business_name: businessName } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/merchant/dashboard");
          router.refresh();
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
              NOMAD
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
          Nomad commerce protocol · 2026
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 md:px-10">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-xs text-subtle hover:text-ink lg:hidden"
          >
            <ArrowLeft className="size-3.5" /> Back to Nomad
          </Link>
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
              <Store className="size-4" />
            </span>
            <div>
              <p className="font-semibold">NOMAD</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                Merchant OS
              </p>
            </div>
          </div>

          {confirmation ? (
            <div className="rounded-2xl border border-success/60 bg-white p-7 shadow-card">
              <span className="grid size-12 place-items-center rounded-2xl bg-success/40 text-success-ink">
                <CheckCircle2 className="size-6" />
              </span>
              <h1 className="mt-6 text-3xl font-semibold tracking-[-0.05em]">
                Check your inbox
              </h1>
              <p className="mt-3 text-sm leading-6 text-subtle">
                Confirm your email to activate the Merchant workspace, then
                return here to sign in.
              </p>
              <button
                onClick={() => {
                  setConfirmation(false);
                  setMode("signin");
                }}
                className="mt-7 h-11 w-full rounded-xl bg-primary text-sm font-medium text-white"
              >
                Return to sign in
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 shadow-card md:p-8">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <LockKeyhole className="size-5" />
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-success-ink">
                  <ShieldCheck className="size-3.5" /> Secure access
                </span>
              </div>
              <h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">
                {mode === "signin" ? "Welcome back" : "Create your storefront"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-subtle">
                {mode === "signin"
                  ? "Sign in to operate your agent-ready catalog."
                  : "Start with a Merchant identity protected by Supabase RLS."}
              </p>
              {mockMode ? (
                <div className="mt-6 rounded-xl border border-primary/15 bg-primary-soft p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <FlaskConical className="size-4" /> Local demo mode
                  </div>
                  <p className="mt-2 text-xs leading-5 text-subtle">
                    Open a populated Merchant workspace without creating an
                    account. Demo changes stay in memory until the development
                    server restarts.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      router.replace(nextPath);
                      router.refresh();
                    }}
                    className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-soft transition hover:bg-primary-hover"
                  >
                    Explore demo workspace <ArrowRight className="size-4" />
                  </button>
                </div>
              ) : null}
              <div
                className="mt-6 grid grid-cols-2 rounded-xl bg-canvas p-1"
                role="tablist"
                aria-label="Merchant access mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signin"}
                  onClick={() => {
                    setMode("signin");
                    setMessage("");
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signin" ? "bg-white text-ink shadow-sm" : "text-muted"}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  onClick={() => {
                    setMode("signup");
                    setMessage("");
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${mode === "signup" ? "bg-white text-ink shadow-sm" : "text-muted"}`}
                >
                  Register
                </button>
              </div>
              <form
                onSubmit={(event) => void submit(event)}
                className="mt-6 space-y-4"
              >
                {mode === "signup" ? (
                  <label className="block">
                    <span className="text-xs font-medium">Business name</span>
                    <input
                      name="businessName"
                      required
                      minLength={2}
                      autoComplete="organization"
                      placeholder="Northstar Supply"
                      className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10"
                    />
                  </label>
                ) : null}
                <label className="block">
                  <span className="text-xs font-medium">Work email</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium">Password</span>
                  <span className="relative mt-2 block">
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      className="h-11 w-full rounded-xl border border-line bg-white px-3.5 pr-11 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </span>
                </label>
                {message ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-xs leading-5 text-danger"
                  >
                    {message}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-soft transition hover:bg-primary-hover disabled:opacity-60"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {mode === "signin"
                    ? "Enter Merchant OS"
                    : "Create Merchant account"}
                  <ArrowRight className="size-4" />
                </button>
              </form>
              <p className="mt-5 text-center text-[11px] leading-5 text-muted">
                Your browser receives a publishable key only. Catalog and
                finance commands are authorized by the Node API.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
