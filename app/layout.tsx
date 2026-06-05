import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jewelry Catalog Renderer",
  description: "Production jewelry catalog rendering pipeline"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark is the default ops-console theme (UI-SPEC: dark mode default).
  return (
    <html
      lang="en"
      className={cn("dark", GeistSans.variable, GeistMono.variable)}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
