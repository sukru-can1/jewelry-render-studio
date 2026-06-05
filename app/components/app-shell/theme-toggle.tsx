"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/app/components/ui/button";

/**
 * UI-SPEC §1 top bar — theme toggle. Dark is the default ops-console theme
 * (set on <html class="dark"> in the root layout). This flips the `.dark`
 * class on the document element. Motion respects prefers-reduced-motion via
 * opacity-only transitions in the token layer.
 */
export function ThemeToggle() {
  // Initialize from the current document class so the icon matches on mount.
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="size-9"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
