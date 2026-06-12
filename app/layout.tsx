import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/app/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s · Jewelry Render Studio",
    default: "Jewelry Render Studio",
  },
  description: "Internal studio for rendering Glamira jewelry catalog imagery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark is the default ops-console theme, applied via next-themes (class on
  // <html>, default encoded in the ThemeProvider wrapper) with localStorage
  // persistence so the operator's choice survives reloads.
  // suppressHydrationWarning covers the provider's pre-paint class swap.
  return (
    <html
      lang="en"
      className={cn(GeistSans.variable, GeistMono.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
