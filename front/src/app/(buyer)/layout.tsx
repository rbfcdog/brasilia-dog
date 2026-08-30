import { AppShell } from "@/components/layout/app-shell";
import { ShoppingProvider } from "@/components/providers/shopping-provider";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShoppingProvider>
      <AppShell>{children}</AppShell>
    </ShoppingProvider>
  );
}
