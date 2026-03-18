import type { Metadata } from "next";
import { Manrope, Outfit } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Wayzen School Intelligence",
  description: "Plataforma de inteligencia comercial para escolas brasileiras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.variable} ${manrope.variable} text-white antialiased`}>
        <header className="sticky top-0 z-40 border-b border-[var(--wayzen-border)] bg-[rgba(20,20,20,0.92)] backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
            <Link className="flex items-center gap-3" href="/">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--wayzen-purple)] to-[var(--wayzen-magenta)] font-[var(--font-outfit)] text-lg font-bold text-white">
                W
              </span>
              <span className="font-[var(--font-outfit)] text-base font-semibold tracking-wide text-white md:text-lg">
                Wayzen School Intelligence
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] px-4 py-2 text-white/90 transition hover:border-[var(--wayzen-purple)] hover:text-white"
                href="/"
              >
                Dashboard
              </Link>
              <Link
                className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] px-4 py-2 text-white/90 transition hover:border-[var(--wayzen-purple)] hover:text-white"
                href="/buscar"
              >
                Buscar
              </Link>
              <Link
                className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] px-4 py-2 text-white/90 transition hover:border-[var(--wayzen-purple)] hover:text-white"
                href="/pipeline"
              >
                Pipeline
              </Link>
              <Link
                className="rounded-full border border-[var(--wayzen-border)] bg-[rgba(39,39,87,0.35)] px-4 py-2 text-white/90 transition hover:border-[var(--wayzen-purple)] hover:text-white"
                href="/map"
              >
                Mapa
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
