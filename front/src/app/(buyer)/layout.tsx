import { AppShell } from "@/components/layout/app-shell";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>{children}</AppShell>
  );
}
