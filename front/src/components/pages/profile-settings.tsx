"use client";

import { type User } from "@supabase/supabase-js";
import { Bell, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export function ProfileSettings() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    void client.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const authLabel = loading
    ? "Checking session"
    : user
      ? "Authenticated"
      : configured
        ? "Signed out"
        : "Demo mode";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-ink text-sm font-semibold text-white">HL</div>
              <div><h2 className="font-semibold tracking-[-0.02em]">Henrique Lacerda</h2><p className="mt-1 text-sm text-subtle">{user?.email ?? "Personal demo account"}</p></div>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${user ? "bg-success/40 text-success-ink" : "bg-canvas text-subtle"}`}>{authLabel}</span>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary"><KeyRound className="size-4" /> Supabase authentication</div>
            <p className="mt-2 text-sm leading-6 text-subtle">
              {configured
                ? user
                  ? "This browser has an active public-key Supabase session."
                  : "Supabase is configured, but no user session is active."
                : "Public Supabase variables are not configured, so this frontend is running safely in demo mode."}
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
