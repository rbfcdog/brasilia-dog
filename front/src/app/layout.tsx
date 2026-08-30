import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  let origin = "http://localhost:3000";

  try {
    origin = new URL(configuredOrigin ?? `${protocol}://${host}`).origin;
  } catch {
    // Keep the safe local fallback when proxy metadata is malformed.
  }

  const title = "Nomad — Agentic commerce for buyers and sellers";
  const description = "A fixed-price commerce operating system where people set the rules and AI agents execute with proof.";
  const socialImage = `${origin}/og.png`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "Nomad — fixed-price commerce for people and AI agents." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full bg-canvas font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
