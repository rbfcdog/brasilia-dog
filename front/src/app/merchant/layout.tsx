import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merchant OS | Vero",
  description: "Operate a fixed-price, AI-readable storefront with verifiable agent orders.",
};

export default function MerchantRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
