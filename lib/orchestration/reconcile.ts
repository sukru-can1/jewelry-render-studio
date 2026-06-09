// ORCH-02 — the reconcile cron: a webhook-MISSED fallback plus the stranded-job
// sweep (W-1). The webhook is the PRIMARY status path; RunPod delivers it
// at-least-once but a dropped/failed callback would otherwise strand a job
// non-terminal forever (RESEARCH Pattern 3). Two recovery paths live here:
//
//  reconcileJobs() — for every NON-TERMINAL job that DOES have a runpodJobId, poll
//  getRunPodStatus and replay the result through the SAME writer the webhook uses
//  (applyWebhookResult), so the mapping + terminal guard can never drift between
//  the two paths. A failing poll is swallowed per-job so one bad join key cannot
//  abort the whole tick.
//
//  sweepStrandedJobs() — W-1: a non-terminal job with a NULL runpodJobId is a job
//  whose submit apparently succeeded but whose runpodJobId persist crashed (or which
//  never got a join key) — it can NEVER be polled. Older than STRANDED_THRESHOLD_MS
//  it is released back to 'queued' so the dispatcher re-submits it. The sweep is
//  guarded to non-terminal statuses only, so it can never touch a completed/cancelled
//  job (T-04-16).

import { prisma } from "@/lib/db/prisma";
import { applyWebhookResult } from "@/lib/orchestration/webhook";
import { getRunPodStatus } from "@/lib/runpod";

// Non-terminal statuses that normally carry a runpodJobId and are worth polling.
const POLLABLE_STATUSES = ["submitted", "in_queue", "in_progress"] as const;

// Bound the per-tick poll fan-out so the cron never approaches the Vercel 60s cap.
const POLL_LIMIT = 50;

// A non-terminal job with a NULL runpodJobId older than this is considered stranded
// (submit succeeded but the runpodJobId persist crashed) and released for re-dispatch.
const STRANDED_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export type ReconcileResult = { polled: number };
export type SweepResult = { releasedStranded: number };

/**
 * Poll RunPod for every non-terminal job that has a runpodJobId and replay the
 * result through applyWebhookResult (the SAME idempotent writer + terminal guard
 * the webhook uses, so the two paths can never diverge). A failing poll is caught
 * per-job. Returns the number of jobs polled.
 */
export async function reconcileJobs(): Promise<ReconcileResult> {
  const jobs = await prisma.job.findMany({
    where: {
      status: { in: [...POLLABLE_STATUSES] },
      runpodJobId: { not: null },
    },
    take: POLL_LIMIT,
    orderBy: { id: "asc" },
  });

  let polled = 0;

  for (const job of jobs) {
    if (!job.runpodJobId) continue; // type-narrow; the where already excludes null.
    try {
      const status = await getRunPodStatus(job.runpodJobId);
      // Reuse the webhook writer verbatim: mapping + `status notIn TERMINAL` guard
      // live there, so a reconcile poll can never clobber a settled job or drift
      // from the webhook's behavior.
      await applyWebhookResult({
        id: job.runpodJobId,
        status: status.status,
        output: status.output,
        error: status.error,
      });
      polled += 1;
    } catch (error) {
      // One failing poll (bad join key, RunPod blip) must not abort the batch.
      console.error(`reconcile: poll failed for job ${job.id}`, error);
    }
  }

  return { polled };
}

/**
 * W-1 stranded-job sweep: release non-terminal jobs that have NO runpodJobId join
 * key and are older than STRANDED_THRESHOLD back to 'queued' so the dispatcher
 * re-submits them. Guarded to non-terminal statuses only — never touches a
 * completed/cancelled job. Returns the number of jobs released.
 */
export async function sweepStrandedJobs(): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - STRANDED_THRESHOLD_MS);

  const released = await prisma.job.updateMany({
    where: {
      status: { in: [...POLLABLE_STATUSES] },
      runpodJobId: null,
      submittedAt: { lt: cutoff },
    },
    data: { status: "queued", submittedAt: null },
  });

  return { releasedStranded: released.count };
}
