"use client";

import * as React from "react";
import { Clock, RefreshCw } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";

// UI-SPEC §"Freshness indicator" — a quiet muted-foreground "updated Ns ago" mono
// chip + a Refresh ghost icon-button. States fresh / refreshing / stale. The
// counter increments client-side off the last successful read timestamp; it is
// NOT teal (refresh is a quiet utility). Auto-stop is owned by the parent monitor
// (it stops calling onRefresh once the batch is terminal); this chip just labels.

export function Freshness({
  lastUpdated,
  refreshing,
  stale,
  onRefresh,
}: {
  lastUpdated: number | null;
  refreshing: boolean;
  stale: boolean;
  onRefresh: () => void;
}) {
  // Re-render every second so the "Ns ago" counter ticks.
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(force, 1000);
    return () => clearInterval(t);
  }, []);

  let label: string;
  if (refreshing) {
    label = "updating…";
  } else if (stale) {
    label = "Couldn't refresh — retrying.";
  } else if (lastUpdated == null) {
    label = "updating…";
  } else {
    const sec = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));
    label = sec < 2 ? "updated just now" : `updated ${sec}s ago`;
  }

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          stale && "text-destructive",
        )}
      >
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh"
      >
        <RefreshCw
          className={cn("size-3.5", refreshing && "motion-safe:animate-spin")}
          strokeWidth={1.75}
          aria-hidden
        />
      </Button>
    </div>
  );
}
