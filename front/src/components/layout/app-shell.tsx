"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarClock,
  Headphones,
  History,
  Menu,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { demoStorage } from "@/lib/demo-storage";
import { backendService, type BackendConversation } from "@/services/backend-service";
import { useShoppingStore } from "@/components/providers/shopping-provider";

const navigation = [
  { href: "/assistant", label: "Assistant", icon: MessageSquareText },
  { href: "/scheduled", label: "Scheduled", icon: CalendarClock },
  { href: "/history", label: "History", icon: History },
  { href: "/support", label: "How it works", icon: Headphones },
];

function Brand() {
  return (
    <Link href="/assistant" className="group flex w-fit items-center gap-3 rounded-lg" aria-label="Nomad buyer assistant">
      <div className="grid size-9 place-items-center rounded-[10px] bg-ink text-white shadow-sm transition-transform duration-200 group-hover:-rotate-3 motion-reduce:transform-none">
        <Sparkles className="size-4" aria-hidden="true" />
      </div>
      <div>
        <p className="text-[15px] font-semibold leading-none tracking-[-0.04em]">NOMAD</p>
        <p className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.18em] text-muted">
          Agentic commerce
        </p>
      </div>
    </Link>
  );
}

function SidebarContent({ closeMenu }: { closeMenu?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { scheduledPurchases } = useShoppingStore();
  const [recentConversations, setRecentConversations] = useState<Array<BackendConversation & { label: string }>>([]);

  useEffect(() => {
    void backendService.listConversations().then(async ({ conversations }) => {
      const recent = await Promise.all(conversations.slice(0, 5).map(async (conversation) => {
        const { messages } = await backendService.conversationMessages(conversation.id);
        const firstRequest = messages.find((message) => message.role === "user");
        return {
          ...conversation,
          label: firstRequest?.content || `Conversation ${new Date(conversation.createdAt).toLocaleDateString()}`,
        };
      }));
      setRecentConversations(recent);
    }).catch(() => setRecentConversations([]));
  }, []);

  function newRequest() {
    demoStorage.clearMessages();
    window.dispatchEvent(new Event("nomad:new-request"));
    closeMenu?.();
    router.push("/assistant");
  }


  function openConversation(conversationId: string) {
    closeMenu?.();
    router.push(`/?conversation=${encodeURIComponent(conversationId)}`);
    window.dispatchEvent(new CustomEvent("nomad:open-conversation", { detail: { conversationId } }));
  }
  return (
    <div className="flex h-full flex-col">
      <Brand />

      <button
        onClick={newRequest}
        className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-neutral-800 hover:shadow-md active:translate-y-px motion-reduce:transform-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        New request
      </button>

      <div className="mt-8">
        <p className="px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Workspace</p>
        <nav className="mt-2 space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm transition ${
                  active
                    ? "bg-primary-soft font-medium text-primary before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                    : "text-subtle hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {item.href === "/scheduled" && scheduledPurchases.some((purchase) => purchase.status === "searching") ? (
                  <span className="ml-auto rounded-full bg-success px-2 py-0.5 font-mono text-[9px] text-success-ink">
                    {scheduledPurchases.filter((purchase) => purchase.status === "searching").length}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-8">
        <p className="px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Recent conversations</p>
        <div className="mt-3 space-y-1 px-2 text-sm text-subtle">
          {recentConversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)} className="block w-full truncate rounded-md px-1 py-1.5 text-left hover:bg-canvas hover:text-ink">
              {conversation.label}
            </button>
          ))}
          {recentConversations.length === 0 ? <p className="px-1 py-1.5 text-xs text-muted">No saved conversations</p> : null}
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-3 rounded-xl border border-line bg-surface-raised p-3.5">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-success-ink">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Protected session
          </div>
          <p className="mt-2 text-xs leading-5 text-subtle">Every purchase stays inside an approved mandate.</p>
        </div>
        <Link
          href="/profile"
          onClick={closeMenu}
          aria-current={pathname === "/profile" ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl border p-3 transition hover:border-line-strong hover:bg-canvas ${
            pathname === "/profile" ? "border-primary/20 bg-primary-soft" : "border-line"
          }`}
        >
          <div className="grid size-9 place-items-center rounded-full bg-ink text-xs font-semibold text-white">HL</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Henrique Lacerda</p>
            <p className="text-[11px] text-muted">Personal account</p>
          </div>
          <UserRound className="size-4 text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex lg:h-dvh lg:overflow-hidden">
      <aside className="hidden w-68 shrink-0 border-r border-line bg-white p-5 lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
          <Brand />
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button className="grid size-10 place-items-center rounded-lg border border-line" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] border-r border-line bg-white p-5 shadow-2xl focus:outline-none data-[state=open]:animate-slide-in">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Description className="sr-only">Navigate between your assistant, purchases, and account.</Dialog.Description>
                <Dialog.Close asChild>
                  <button className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg hover:bg-canvas" aria-label="Close navigation">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </Dialog.Close>
                <SidebarContent />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
