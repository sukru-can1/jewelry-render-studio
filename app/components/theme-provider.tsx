"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// UX audit B6 — thin client wrapper around next-themes' provider so the server
// root layout can mount it. next-themes persists the operator's choice in
// localStorage and applies the theme class on <html> before paint (paired with
// suppressHydrationWarning on the root <html> element). Dark is the default
// ops-console theme — that product decision is encoded ONCE here as the
// provider's defaultTheme; callers may still override via props.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider defaultTheme="dark" {...props}>
      {children}
    </NextThemesProvider>
  );
}
