// ORCH-03 — automatic retry of failed jobs under the attempt cap.
//
// A transient GPU/worker failure leaves a Job in 'failed'. This mover re-queues
// such a job idempotently so the Wave-1 dispatcher re-submits it next tick with a
// FRESH RunPod job (runpodJobId reset to null → the next dispatch mints a new join
// key, so at most one in-flight RunPod job per Job row at a time).
//
// IDEMPOTENCY / Pattern 4 guarantee: ONLY a 'failed' job is ever touched. A
// completed/cancelled job is never re-queued (so a successful render is never
// duplicated) and a job that has already burned through RETRY_CAP attempts stays
// failed (no infinite retry loop). Jobs in a cancelled batch are excluded so the
// operator's cancel is respected.

import { prisma } from "@/lib/db/prisma";

// Max automatic attempts before a job is left 'failed' for operator triage.
// attempt is incremented on every re-queue; once attempt >= RETRY_CAP the job is
// no longer auto-retried. Override via env for ops tuning.
export const RETRY_CAP = Number(process.env.RETRY_CAP ?? 2);

export type RetryResult = { requeued: number };

/**
 * Re-queue every failed job under the attempt cap, idempotently.
 *
 * Selects 'failed' jobs whose batch is not cancelling (batch.cancelRequestedAt is
 * null) and whose attempt is below RETRY_CAP, then resets each to a fresh 'queued'
 * state (attempt+1, runpodJobId→null, error→null) so the dispatcher re-submits it.
 *
 * The cap is enforced per-job (not only in the where clause) so a job at/over the
 * cap is provably never re-queued. Returns the count of jobs re-queued.
 */
export async function retryFailedJobs(): Promise<RetryResult> {
  // status:'failed' is the idempotency key — a completed/cancelled job is never in
  // this set, so a successful render can never be duplicated. The cancelled-batch
  // guard (batch.cancelRequestedAt null) respects an operator's batch cancel.
  const failed = await prisma.job.findMany({
    where: {
      status: "failed",
      attempt: { lt: RETRY_CAP },
      batch: { cancelRequestedAt: null },
    },
    take: 50,
    orderBy: { id: "asc" },
  });

  let requeued = 0;

  for (const job of failed) {
    // Defense-in-depth cap guard: never re-queue a job at/over the cap even if the
    // where filter ever drifts — a completed render must never be duplicated.
    if (job.attempt >= RETRY_CAP) continue;

    // Idempotent re-queue: clearing runpodJobId means the next dispatch mints a
    // fresh RunPod join key (at most one in-flight RunPod job per Job row).
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "queued",
        attempt: job.attempt + 1,
        runpodJobId: null,
        error: null,
      },
    });
    requeued += 1;
  }

  return { requeued };
}
