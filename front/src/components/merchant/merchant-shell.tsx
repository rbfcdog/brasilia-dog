"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  BookOpenCheck,
  Bot,
  Boxes,
  ChevronRight,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isMerchantMockMode } from "@/lib/supabase/config";
import { createMerchantBrowserClient } from "@/lib/supabase/client";

const navigation = [
  { href: "/merchant/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/merchant/orders", label: "Orders", icon: BookOpenCheck },
  { href: "/merchant/catalog", label: "Catalog", icon: Boxes },
  { href: "/merchant/finance", label: "Finance", icon: ReceiptText },
];

function MerchantBrand() {
  return (
    <Link
      href="/merchant/dashboard"
      className="flex w-fit items-center gap-3 rounded-xl"
      aria-label="Nomad merchant dashboard"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-white text-primary shadow-sm">
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
  );
}

function MerchantSidebar({
  businessName,
  email,
  close,
}: {
  businessName: string;
  email: string;
  close?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    if (!isMerchantMockMode()) {
      await createMerchantBrowserClient().auth.signOut();
    }
    close?.();
    router.replace("/merchant/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col text-white">
      <MerchantBrand />
      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.07] p-3.5">
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-success">
          <ShieldCheck className="size-3.5" /> Projection-only access
        </div>
        <p className="mt-2 text-xs leading-5 text-white/50">
          Actions are verified by the server. Financial authority never reaches
          this browser.
        </p>
      </div>
      <nav className="mt-8 space-y-1" aria-label="Merchant navigation">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm transition ${active ? "bg-white text-primary shadow-sm" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon className="size-4" strokeWidth={1.8} />
              <span>{label}</span>
              {active ? <ChevronRight className="ml-auto size-3.5" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <Link
          href="/assistant"
          className="flex items-center gap-3 rounded-xl border border-white/10 px-3.5 py-3 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <Bot className="size-4" /> Switch to Buyer
        </Link>
        <div className="rounded-xl bg-[#2634b5] p-3.5">
          <p className="truncate text-sm font-medium">{businessName}</p>
          <p className="mt-1 truncate text-[11px] text-white/45">{email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function MerchantShell({
  children,
  businessName,
  email,
}: {
  children: React.ReactNode;
  businessName: string;
  email: string;
}) {
  return (
    <div className="min-h-dvh bg-[#f9fafb] text-ink lg:flex lg:h-dvh lg:overflow-hidden">
      <aside className="hidden w-72 shrink-0 bg-primary p-5 lg:block">
        <MerchantSidebar businessName={businessName} email={email} />
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-black/[0.08] bg-primary px-4 text-white lg:hidden">
          <MerchantBrand />
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                className="grid size-10 place-items-center rounded-xl border border-white/15"
                aria-label="Open merchant navigation"
              >
                <Menu className="size-5" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(88vw,330px)] bg-primary p-5 shadow-2xl focus:outline-none data-[state=open]:animate-slide-in">
                <Dialog.Title className="sr-only">
                  Merchant navigation
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Navigate through your merchant workspace.
                </Dialog.Description>
                <Dialog.Close asChild>
                  <button
                    className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label="Close merchant navigation"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <div className="h-full">
                    <MerchantSidebar
                      businessName={businessName}
                      email={email}
                    />
                  </div>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
