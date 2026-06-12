"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/app/components/ui/button";

/**
 * UI-SPEC §1 top bar — theme toggle. Dark is the default ops-console theme
 * (next-themes defaultTheme="dark" in the root layout). useTheme() reads and
 * persists the choice via localStorage so it survives reloads. Until mounted we
 * render the same static markup on server and client (no hydration mismatch).
 * Motion respects prefers-reduced-motion via opacity-only transitions in the
 * token layer.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className="size-9"
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="size-9"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
