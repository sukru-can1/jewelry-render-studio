"use server";

// ORCH-05 — cancelBatch / cancelJob Server Actions.
//
// AUTHORITATIVE trust boundary for the cancel slice (mirrors createBatch §1/§3 in
// lib/batches/actions.ts):
//   1. requireSession() is the FIRST statement — fail-closed (a thrown 401 Response
//      means NO write). T-04-07.
//   2. IDOR load-and-reject: the batchId/jobId is never trusted — load the row and
//      reject a missing one with { ok:false } and NO write (single-tenant per repo
//      convention; requireSession is still required). T-04-08.
//
// IMMEDIATE-CANCEL MODEL (W-4 option A): a cancelable job is set to status
// 'cancelled' AND cancelRequestedAt = now in ONE write. cancelRequestedAt is purely
// the AUDIT TIMESTAMP of the operator's request — there is NO distinct persisted
// 'cancelling' phase that a later reconcile flips to 'cancelled'. The brief
// 'cancelling' label is a client-side optimistic concern (04-06). Already-terminal
// jobs (completed/failed/cancelled) are KEPT untouched. The cancelled-batch
// where-guards (Waves 1–2) ensure the dispatcher/retry never re-dispatch these jobs.
//
// RunPod /cancel is best-effort: each cancelRunPod call is wrapped in try/catch so a
// RunPod outage can never block recording the cancel (T-04-09, accept) — the
// reconcile cron mops up any RunPod-side residue; the DB cancel is authoritative now.

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { cancelRunPod } from "@/lib/runpod";
import { TERMINAL_STATUSES } from "@/lib/orchestration/status-map";

export type CancelResult = { ok: boolean; cancelled?: number; error?: string };

const TERMINAL = new Set<string>(TERMINAL_STATUSES);

/** Best-effort RunPod stop — a RunPod throw must never block the DB cancel. */
async function stopRunPod(runpodJobId: string | null | undefined): Promise<void> {
  if (!runpodJobId) return;
  try {
    await cancelRunPod(runpodJobId);
  } catch {
    // T-04-09 (accept): reconcile cron catches up; the DB cancel is authoritative.
  }
}

/**
 * Cancel a single queued/running job. requireSession first (fail-closed), IDOR
 * load-and-reject, RunPod best-effort stop, then status→'cancelled' +
 * cancelRequestedAt in one write (immediate model A). A terminal job is KEPT.
 */
export async function cancelJob(jobId: string): Promise<CancelResult> {
  // (1) AUTH first — fail-closed. A thrown 401 Response propagates (no write).
  await requireSession();

  // (V5) Validate the id is a non-empty string before any DB read.
  if (typeof jobId !== "string" || jobId.length === 0) {
    return { ok: false, error: "Invalid job id." };
  }

  // (2) IDOR load-and-reject — never trust the client jobId.
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { ok: false, error: "Job not found." };
  }

  // (3) A terminal job exposes no cancel — KEEP it untouched (no RunPod, no write).
  if (TERMINAL.has(job.status as string)) {
    return { ok: false, error: "Job is already settled." };
  }

  // (4) Stop the in-flight RunPod job best-effort, then record the cancel.
  await stopRunPod(job.runpodJobId);

  // (5) IMMEDIATE cancel (model A): status 'cancelled' + cancelRequestedAt in ONE write.
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "cancelled", cancelRequestedAt: new Date() },
  });

  revalidatePath(`/batches/${job.batchId}`);
  return { ok: true, cancelled: 1 };
}

/**
 * Cancel a whole batch. requireSession first, IDOR load-and-reject, stop every
 * still-cancelable job on RunPod (best-effort), then updateMany the non-terminal
 * jobs to 'cancelled' + cancelRequestedAt (immediate model A). Already-completed
 * jobs are KEPT. Batch.cancelRequestedAt is recorded as the audit timestamp.
 */
export async function cancelBatch(batchId: string): Promise<CancelResult> {
  // (1) AUTH first — fail-closed.
  await requireSession();

  // (V5) Validate the id before any DB read.
  if (typeof batchId !== "string" || batchId.length === 0) {
    return { ok: false, error: "Invalid batch id." };
  }

  // (2) IDOR load-and-reject — load the batch with its jobs.
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { jobs: true },
  });
  if (!batch) {
    return { ok: false, error: "Batch not found." };
  }

  const now = new Date();
  const jobs = batch.jobs ?? [];
  const cancelable = jobs.filter((j) => !TERMINAL.has(j.status as string));

  // (3) Stop every still-cancelable RunPod job best-effort (a RunPod outage must
  //     not block recording the cancel).
  for (const job of cancelable) {
    await stopRunPod(job.runpodJobId);
  }

  // (4) Record the batch-level audit timestamp (status stays derived String, A4).
  await prisma.batch.update({
    where: { id: batch.id },
    data: { cancelRequestedAt: now },
  });

  // (5) IMMEDIATE cancel of all non-terminal jobs in ONE write — completed/failed
  //     jobs are KEPT untouched by the notIn-terminal where-guard.
  await prisma.job.updateMany({
    where: { batchId: batch.id, status: { notIn: [...TERMINAL_STATUSES] } },
    data: { status: "cancelled", cancelRequestedAt: now },
  });

  revalidatePath(`/batches/${batch.id}`);
  return { ok: true, cancelled: cancelable.length };
}
