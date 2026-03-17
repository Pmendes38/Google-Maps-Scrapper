import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const font = Space_Grotesk({ subsets: ["latin"], variable: "--font-wayzen" });

export const metadata: Metadata = {
  title: "Wayzen School Intelligence",
  description: "Plataforma de inteligencia comercial para escolas brasileiras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${font.variable} bg-[#f2f2ec] font-sans text-gray-900`}>
        <header className="border-b border-gray-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link className="text-lg font-semibold tracking-tight" href="/">
              Wayzen School Intelligence
            </Link>
            <nav className="flex gap-2 text-sm">
              <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 hover:border-gray-400" href="/pipeline">
                Pipeline
              </Link>
              <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 hover:border-gray-400" href="/buscar">
                Buscar
              </Link>
              <Link className="rounded-full border border-gray-300 bg-white px-4 py-2 hover:border-gray-400" href="/map">
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
