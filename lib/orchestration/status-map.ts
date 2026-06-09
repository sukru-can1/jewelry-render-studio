// Phase 4 ORCH — the SINGLE shared RunPod→DB status mapping (Don't Hand-Roll).
// Both the webhook route (Wave 1) and the reconcile cron (Wave 2) import this so
// the two reconciliation paths can never drift. JobStatus literal values come
// from @prisma/client so the mapping stays in lockstep with the enum.

import type { JobStatus } from "@prisma/client";

/**
 * Collapse any RunPod job status string to the DB JobStatus enum.
 * Unknown/unmapped statuses return null so callers can ignore them (no write).
 */
export function mapRunPodStatus(runpodStatus: string): JobStatus | null {
  switch (runpodStatus) {
    case "COMPLETED":
      return "completed";
    case "FAILED":
    case "TIMED_OUT":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "IN_PROGRESS":
      return "in_progress";
    case "IN_QUEUE":
      return "in_queue";
    default:
      return null;
  }
}

/**
 * The terminal DB statuses — a job in one of these is settled and must never be
 * re-written by a late/duplicate callback or a reconcile poll (idempotency key).
 */
export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/** Membership test against TERMINAL_STATUSES. */
export function isTerminal(status: JobStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Truncate worker stdout/stderr to the repo's ~4000-char tail convention before
 * persisting into Job.error (A2 — reuse Job.error, no separate log column).
 */
export function tail(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}
