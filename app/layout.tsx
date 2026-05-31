import type { Metadata } from "next";
import { SiteNav } from "@/components/layout/site-nav";
import { PersistentPlayerShell } from "@/components/player/persistent-player-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "As It Sounds",
  description: "A curated, poetic, mood-first sample library.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="ais-shell bg-ais-bg text-ais-text">
        <SiteNav />
        <main className="mx-auto flex min-h-[calc(100vh-13rem)] w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <PersistentPlayerShell />
      </body>
    </html>
  );
}
