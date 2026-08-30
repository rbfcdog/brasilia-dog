"use client";

import { Bell, KeyRound, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PaymentSettings } from "@/components/pages/payment-settings";
import { backendService } from "@/services/backend-service";
import { authService } from "@/services/auth-service";
type BackendStatus = "checking" | "available" | "unavailable";

export function ProfileSettings() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await authService.signOut();
      router.replace("/");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  useEffect(() => {
    void backendService
      .health()
      .then(() => setBackendStatus("available"))
      .catch(() => setBackendStatus("unavailable"));
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="h-full rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-full bg-ink text-white"><KeyRound className="size-5" aria-hidden="true" /></div>
            <div>
              <h2 className="font-semibold tracking-[-0.02em]">Account security</h2>
              <p className="mt-1 text-sm text-subtle">Passkeys are enrolled when an account is first created.</p>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
            <p className="text-sm leading-6 text-subtle">A fresh device passkey verification is required only when you approve or extend a purchase mandate.</p>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Backend: {backendStatus}</p>
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
          <div className="flex items-center gap-3"><Bell className="size-5 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Notifications</h2><p className="mt-0.5 text-xs text-muted">Purchase and mandate updates</p></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <label className="flex items-center justify-between gap-4"><span>Mandate activity</span><input type="checkbox" name="mandateActivity" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Purchase receipts</span><input type="checkbox" name="purchaseReceipts" defaultChecked className="size-4 accent-primary" /></label>
            <label className="flex items-center justify-between gap-4"><span>Blocked attempts</span><input type="checkbox" name="blockedAttempts" defaultChecked className="size-4 accent-primary" /></label>
          </div>
        </article>

        <article className="h-full rounded-2xl border border-danger/20 bg-danger-soft p-5 shadow-sm">
          <h2 className="font-semibold tracking-[-0.02em]">Session</h2>
          <p className="mt-1 text-sm text-subtle">End this customer session on this browser.</p>
          <button type="button" onClick={() => void signOut()} disabled={signingOut} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-danger/30 bg-white px-4 text-sm font-medium text-danger transition hover:bg-danger-soft disabled:opacity-60">
            <LogOut className="size-4" aria-hidden="true" /> {signingOut ? "Signing out..." : "Sign out"}
          </button>
          {signOutError ? <p role="alert" className="mt-3 text-xs text-danger">{signOutError}</p> : null}
        </article>
      </div>
      <PaymentSettings />
    </div>
  );
}
