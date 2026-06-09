"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ImageIcon, RotateCw } from "lucide-react";
import type { JobStatus } from "@prisma/client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/app/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { BatchProgress, BatchStatus } from "@/lib/orchestration/batch-status";
import { isTerminal } from "@/lib/orchestration/status-map";
import { MONITOR_POLL_MS } from "@/lib/orchestration/monitor-config";

import { AggregateBar } from "../aggregate-bar";
import { JobStatusPill } from "../status-pill";
import { ErrorLog } from "./error-log";
import { Freshness } from "./freshness";
import { CancelJobControl } from "./cancel-controls";

const RETRY_MAX = 2;

// The per-job shape the monitor renders. The page seeds it from the DB on first
// paint; the freshness route reseeds it (DB-only) on each poll.
export type MonitorJob = {
  id: string;
  status: JobStatus;
  combo: string;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  thumbnailUrl: string | null;
};

export type MonitorSnapshot = {
  status: BatchStatus;
  progress: BatchProgress;
  jobs: MonitorJob[];
};

// Status-route payload (DB-only). startedAt/finishedAt arrive as ISO strings; the
// route does NOT carry combo/error/thumbnail, so we merge those from the seed by id.
type StatusPayload = {
  status: BatchStatus;
  progress: BatchProgress;
  jobs: {
    id: string;
    status: JobStatus;
    attempt: number;
    startedAt: string | null;
    finishedAt: string | null;
  }[];
};

type FilterKey =
  | "all"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

function bucketOf(status: JobStatus): Exclude<FilterKey, "all"> {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "in_progress":
      return "running";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
}

function isJobTerminal(status: JobStatus): boolean {
  return isTerminal(status);
}

function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
  status: JobStatus,
): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.round((end - start) / 1000));
  void status;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function JobsMonitor({
  batchId,
  initial,
}: {
  batchId: string;
  initial: MonitorSnapshot;
}) {
  const [snapshot, setSnapshot] = React.useState<MonitorSnapshot>(initial);
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(Date.now());
  const [refreshing, setRefreshing] = React.useState(false);
  const [stale, setStale] = React.useState(false);

  // Tick durations for running jobs (the live duration column).
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const batchTerminal =
    snapshot.status === "completed" ||
    snapshot.status === "failed" ||
    snapshot.status === "partly failed" ||
    snapshot.status === "cancelled";

  // Merge a DB-only status payload over the current snapshot, preserving the
  // combo/error/thumbnail fields the freshness route does not carry.
  const reseed = React.useCallback(
    (payload: StatusPayload) => {
      setSnapshot((prev) => {
        const byId = new Map(prev.jobs.map((j) => [j.id, j]));
        const jobs: MonitorJob[] = payload.jobs.map((j) => {
          const seed = byId.get(j.id);
          return {
            id: j.id,
            status: j.status,
            attempt: j.attempt,
            startedAt: j.startedAt,
            finishedAt: j.finishedAt,
            combo: seed?.combo ?? j.id,
            error: seed?.error ?? null,
            thumbnailUrl: seed?.thumbnailUrl ?? null,
          };
        });
        return { status: payload.status, progress: payload.progress, jobs };
      });
    },
    [],
  );

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/batches/${batchId}/status`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const payload = (await res.json()) as StatusPayload;
      reseed(payload);
      setLastUpdated(Date.now());
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      setRefreshing(false);
    }
  }, [batchId, reseed]);

  // DB-only poll while non-terminal; auto-stop on terminal.
  React.useEffect(() => {
    if (batchTerminal) return;
    const t = setInterval(refresh, MONITOR_POLL_MS);
    return () => clearInterval(t);
  }, [batchTerminal, refresh]);

  const counts: Record<FilterKey, number> = React.useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: snapshot.jobs.length,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const j of snapshot.jobs) c[bucketOf(j.status)] += 1;
    return c;
  }, [snapshot.jobs]);

  const rows = React.useMemo(
    () =>
      filter === "all"
        ? snapshot.jobs
        : snapshot.jobs.filter((j) => bucketOf(j.status) === filter),
    [snapshot.jobs, filter],
  );

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "queued", label: "Queued" },
    { key: "running", label: "Running" },
    { key: "completed", label: "Completed" },
    { key: "failed", label: "Failed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Progress
          </span>
          <Freshness
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            stale={stale}
            onRefresh={refresh}
          />
        </div>
        <AggregateBar progress={snapshot.progress} />
      </div>

      <div className="flex flex-col gap-3">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as FilterKey)}
          variant="outline"
          className="flex-wrap justify-start"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.key} value={f.key} className="gap-1.5">
              {f.label}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts[f.key]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Combo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempt</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No jobs in this batch.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((job) => {
                  const isOpen = expanded === job.id;
                  const canExpand =
                    job.status === "failed" || job.status === "completed";
                  const cancelable = !isJobTerminal(job.status);
                  return (
                    <React.Fragment key={job.id}>
                      <TableRow
                        className={cn(canExpand && "cursor-pointer")}
                        onClick={() =>
                          canExpand &&
                          setExpanded((cur) => (cur === job.id ? null : job.id))
                        }
                      >
                        <TableCell className="text-muted-foreground">
                          {canExpand ? (
                            isOpen ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {job.combo}
                        </TableCell>
                        <TableCell>
                          <JobStatusPill status={job.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          <span className="inline-flex items-center justify-end gap-1">
                            {job.attempt > 1 ? (
                              <RotateCw
                                className="size-3 text-muted-foreground"
                                aria-hidden
                              />
                            ) : null}
                            {job.attempt} / {RETRY_MAX}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {job.status === "in_progress" && !job.finishedAt ? (
                            <span>
                              {formatDuration(
                                job.startedAt,
                                null,
                                job.status,
                              )}
                            </span>
                          ) : (
                            formatDuration(
                              job.startedAt,
                              job.finishedAt,
                              job.status,
                            )
                          )}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cancelable ? (
                            <CancelJobControl
                              jobId={job.id}
                              combo={job.combo}
                              onCancelled={refresh}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {isOpen && canExpand ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-muted/20">
                            {job.status === "failed" ? (
                              <ErrorLog error={job.error} />
                            ) : (
                              <CompletedPreview
                                thumbnailUrl={job.thumbnailUrl}
                                batchId={batchId}
                                jobId={job.id}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// Completed-job light preview: a 160×160 thumbnail + "View in gallery" link into
// the P5 outputs gallery (/batches/[id]/gallery, deep-linked by job id). Falls
// back to a placeholder when no Layer thumbnail is persisted yet.
function CompletedPreview({
  thumbnailUrl,
  batchId,
  jobId,
}: {
  thumbnailUrl: string | null;
  batchId: string;
  jobId: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt="Rendered pass preview"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon
            className="size-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </div>
      <Link
        href={`/batches/${batchId}/gallery#${jobId}`}
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        View in gallery
      </Link>
    </div>
  );
}
