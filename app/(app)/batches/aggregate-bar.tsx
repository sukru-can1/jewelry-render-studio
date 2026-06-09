import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { BatchProgress } from "@/lib/orchestration/batch-status";

// UI-SPEC §"New Component Inventory" — Aggregate progress bar + stat row.
// A segmented horizontal track (completed → running → queued → failed, with a
// cancelled grey remainder) using ONLY inherited status tokens, above a row of
// mono stat cells. Two variants: `compact` (thin bar + `n / total`) for the
// Batches-list rows, and the full variant (stat row) for the detail header.
// First-party — composed on existing primitives, no new shadcn registry.

type Segment = { key: string; value: number; className: string };

function segments(p: BatchProgress): Segment[] {
  return [
    { key: "completed", value: p.completed, className: "bg-success" },
    { key: "running", value: p.running, className: "bg-info" },
    { key: "queued", value: p.queued, className: "bg-warning" },
    { key: "failed", value: p.failed, className: "bg-destructive" },
    {
      key: "cancelled",
      value: p.cancelled ?? 0,
      // grey hatched remainder — a cancellation is not a "loss".
      className: "bg-muted-foreground/40",
    },
  ];
}

function SegmentedBar({
  progress,
  className,
}: {
  progress: BatchProgress;
  className?: string;
}) {
  const total = progress.total || 1;
  return (
    <div
      className={cn(
        "flex h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.completed}
    >
      {segments(progress).map((s) =>
        s.value > 0 ? (
          <div
            key={s.key}
            className={cn(
              s.className,
              s.key === "running" && "motion-safe:animate-pulse",
            )}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

const STAT_CELLS = [
  { key: "completed", caption: "COMPLETED" },
  { key: "failed", caption: "FAILED" },
  { key: "running", caption: "RUNNING" },
  { key: "queued", caption: "QUEUED" },
  { key: "total", caption: "TOTAL" },
] as const;

/**
 * Aggregate progress bar + stat row.
 * - `compact`: thin segmented bar + `n / total` (Batches-list rows).
 * - full (default): segmented bar above the mono stat cells (detail header).
 * - `loading`: skeleton bar (+ skeleton numbers in the full variant).
 */
export function AggregateBar({
  progress,
  compact = false,
  loading = false,
  className,
}: {
  progress?: BatchProgress;
  compact?: boolean;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !progress) {
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
      );
    }
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-5 gap-2">
          {STAT_CELLS.map((c) => (
            <Skeleton key={c.key} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <SegmentedBar progress={progress} className="flex-1" />
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {progress.completed} / {progress.total}
        </span>
      </div>
    );
  }

  const values: Record<string, number> = {
    completed: progress.completed,
    failed: progress.failed,
    running: progress.running,
    queued: progress.queued,
    total: progress.total,
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <SegmentedBar progress={progress} />
      <div className="grid grid-cols-5 gap-2">
        {STAT_CELLS.map((c) => (
          <div key={c.key} className="flex flex-col gap-0.5">
            <span className="font-mono text-xl font-semibold tabular-nums leading-none text-foreground">
              {values[c.key]}
            </span>
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {c.caption}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
