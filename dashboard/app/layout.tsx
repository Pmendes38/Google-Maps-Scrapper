import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import "./globals.css";

const font = Space_Grotesk({ subsets: ["latin"], variable: "--font-wayzen" });

export const metadata: Metadata = {
  title: "Wayzen School Intelligence",
  description: "Plataforma de inteligencia comercial para escolas brasileiras",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${font.variable} font-sans`}>{children}</body>
    </html>
  );
}
