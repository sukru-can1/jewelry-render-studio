// ORCH-04 — the SINGLE DB-only batch progress source. Imported by the Batches
// list (app/(app)/batches/page.tsx), the freshness route (app/api/batches/[id]/
// status/route.ts), and the detail monitor (04-06). Centralizing the derivation
// here keeps the list, detail, and route from ever diverging.
//
// DB-ONLY CONTRACT (ORCH-02 / RESEARCH Pattern 5/6): this module reads Postgres
// only. It MUST NOT import lib/runpod — progress is derived from Job.status rows
// the webhook + reconcile cron wrote out-of-band, never from a per-request
// RunPod fan-out (the Vercel 60s cap makes that impossible at batch scale).

import type { JobStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Operator-facing progress counts collapsed from the raw DB JobStatus enum.
 * - running  = in_progress
 * - queued   = queued + submitted + in_queue
 * - completed / failed / cancelled map 1:1
 * (UI-SPEC "Job-status → status-pill mapping".)
 */
export type BatchProgress = {
  completed: number;
  failed: number;
  running: number;
  queued: number;
  // Optional: callers that derive status from queued/running/completed/failed
  // alone (e.g. the unit test's count fixtures) need not supply cancelled.
  cancelled?: number;
  total: number;
};

/** Derived batch status — never stored; computed from job counts (A4). */
export type BatchStatus =
  | "queued"
  | "running"
  | "completed"
  | "partly failed"
  | "failed"
  | "cancelling"
  | "cancelled";

/** A single prisma.job.groupBy({ by:['status'], _count }) row, loosely typed so
 *  both the `_count: number` and `_count: { _all: number }` shapes collapse. */
type GroupRow = {
  status: JobStatus;
  _count: number | { _all?: number } | null | undefined;
};

function countOf(row: GroupRow): number {
  const c = row._count;
  if (typeof c === "number") return c;
  if (c && typeof c === "object") return c._all ?? 0;
  return 0;
}

/**
 * Collapse a groupBy(status) result into operator-facing BatchProgress counts.
 * Pure — no DB access — so it is trivially unit-testable (ORCH-04 RED test).
 */
export function summarizeJobs(rows: GroupRow[]): BatchProgress {
  // Strongly-typed (cancelled required) so the accumulator is never undefined;
  // the returned BatchProgress widens cancelled to optional for callers.
  const counts: Required<BatchProgress> = {
    completed: 0,
    failed: 0,
    running: 0,
    queued: 0,
    cancelled: 0,
    total: 0,
  };

  for (const row of rows) {
    const n = countOf(row);
    counts.total += n;
    switch (row.status) {
      case "completed":
        counts.completed += n;
        break;
      case "failed":
        counts.failed += n;
        break;
      case "in_progress":
        counts.running += n;
        break;
      case "queued":
      case "submitted":
      case "in_queue":
        counts.queued += n;
        break;
      case "cancelled":
        counts.cancelled += n;
        break;
      default:
        // Unknown status: counted in total, but not in any bucket. Defensive —
        // the enum is closed so this is unreachable in practice.
        break;
    }
  }

  return counts;
}

/**
 * DB-only progress for one batch: a single groupBy round-trip, then collapse.
 * Bounded constant-cost regardless of batch size (T-04-12 — no RunPod fan-out).
 */
export async function batchProgress(batchId: string): Promise<BatchProgress> {
  const rows = await prisma.job.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true },
  });
  return summarizeJobs(rows as GroupRow[]);
}

/**
 * Derive the operator-facing batch status from its job counts (UI-SPEC
 * "Derived batch status"). `cancelRequestedAt` is the audit timestamp from
 * Batch.cancelRequestedAt; the persisted truth is the job statuses themselves.
 *
 * Cancel — immediate model A (04-04): once cancel is requested the cancelable
 * jobs are written to 'cancelled' immediately, so 'cancelling' is only the
 * transient display while cancelRequestedAt is set AND non-terminal jobs still
 * remain (queued+running > 0). Once everything is terminal it derives
 * 'cancelled'. Both 'cancelling' and 'cancelled' render with the neutral token.
 */
export function deriveBatchStatus(
  counts: BatchProgress,
  cancelRequestedAt?: Date | null,
): BatchStatus {
  const { total, completed, failed, running, queued } = counts;

  const nonTerminal = running + queued;

  // Cancel was requested: while non-terminal jobs remain it's the transient
  // 'cancelling' display; once all are settled it's 'cancelled'.
  if (cancelRequestedAt) {
    return nonTerminal > 0 ? "cancelling" : "cancelled";
  }

  // No jobs at all — treat as queued (defensive; a built batch always has jobs).
  if (total === 0) return "queued";

  // Anything still running → running.
  if (running > 0) return "running";

  const allTerminal = nonTerminal === 0;

  if (allTerminal) {
    if (failed === 0 && completed > 0) return "completed";
    if (completed === 0 && failed > 0) return "failed";
    if (failed > 0 && completed > 0) return "partly failed";
    // All terminal but neither completed nor failed → everything cancelled.
    return "cancelled";
  }

  // Non-terminal jobs remain, none running → still queued.
  return "queued";
}
