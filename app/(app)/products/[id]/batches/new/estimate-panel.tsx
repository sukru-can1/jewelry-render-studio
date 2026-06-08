"use client";

// UI-SPEC §2 — the live estimate panel (the cost-guardrail centerpiece). Renders the
// 40px Geist Mono "big number" (declared typographic exception, reserved for THIS
// readout), the formula line, est. minutes + cost (20px mono) with the basis tooltip,
// and a per-zone status frame using the INHERITED status tokens (idle/neutral,
// safe/success, warn/amber, block/destructive). The number itself stays high-contrast
// --foreground; the FRAME carries the hue. Over hard cap the number renders destructive.
// Sticky rail >=1024px / docked bottom bar <1024px so the cost is never scrolled off.

import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Zone } from "@/lib/batches/estimate";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";

// Zone -> frame treatment (inherited status hues; NEVER accent/teal on the number).
const FRAME: Record<Zone, string> = {
  idle: "border-border",
  safe: "border-l-4 border-l-emerald-500/70 border-border",
  warn: "border-l-4 border-l-amber-500 border-amber-500/40",
  block: "border-l-4 border-l-destructive border-destructive/50",
};

export function EstimatePanel({
  jobs,
  minutes,
  costUsd,
  zone,
  angleCount,
  metalCount,
  passCount,
  samples,
  width,
  height,
  invalid,
  submitting,
}: {
  jobs: number;
  minutes: number;
  costUsd: number;
  zone: Zone;
  angleCount: number;
  metalCount: number;
  passCount: number;
  samples: number;
  width: number;
  height: number;
  invalid: boolean;
  submitting: boolean;
}) {
  const bigNumber = invalid ? "—" : jobs.toLocaleString("en-US");
  const escalated = zone === "warn" || zone === "block";

  return (
    <div
      data-slot="estimate-panel"
      data-zone={zone}
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-5",
        FRAME[zone],
      )}
    >
      {/* Big number + jobs label */}
      <div className="flex items-start gap-3">
        {escalated ? (
          <TriangleAlert
            className={cn(
              "mt-2 size-6 shrink-0",
              zone === "warn" ? "text-amber-500" : "text-destructive",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
        <div className="flex flex-col">
          <span
            className={cn(
              "font-mono text-[40px] font-semibold leading-[1.1] tabular-nums motion-reduce:transition-none",
              invalid
                ? "text-muted-foreground"
                : zone === "block"
                  ? "text-destructive"
                  : "text-foreground",
            )}
          >
            {bigNumber}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            jobs
          </span>
        </div>
      </div>

      {/* Formula line (mono) */}
      <p className="font-mono text-sm tabular-nums text-muted-foreground">
        {angleCount} angles × {metalCount} metals × {passCount} passes
      </p>

      {/* Est. time + cost (20px mono) with the basis tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="cursor-help font-mono text-xl font-semibold tabular-nums text-foreground">
            ~{invalid ? "—" : Math.max(1, Math.round(minutes))} min · ~$
            {invalid ? "—" : costUsd.toFixed(2)} on GPU
          </p>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Estimated from {samples} samples at {width}×{height} across{" "}
          {invalid ? 0 : jobs} jobs. Actual GPU time varies.
        </TooltipContent>
      </Tooltip>

      {submitting ? (
        <p className="text-sm text-sky-500">Creating batch…</p>
      ) : null}
    </div>
  );
}
