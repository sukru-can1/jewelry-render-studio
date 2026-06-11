// ORCH-02/04 — parse a RunPod terminal callback and write the matching Job
// IDEMPOTENTLY. RunPod delivers the webhook at-least-once (RESEARCH Pitfall 3),
// so every write is guarded by `status notIn TERMINAL`: a duplicate/late callback
// on an already-settled job matches zero rows and clobbers nothing. The body.id
// must match a known runpodJobId for any write to land (T-04-03) — a forged id
// with no matching row writes nothing.

import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import type { Combo } from "@/lib/batches/expand";
import { deriveLayerFromResult } from "@/lib/orchestration/layers";
import { TERMINAL_STATUSES, mapRunPodStatus, tail } from "@/lib/orchestration/status-map";

// V5: validate the callback shape before use. RunPod sends { id, status, output?, error? }.
const callbackSchema = z.object({
  id: z.string(),
  status: z.string(),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
});

// Mutable spread so Prisma's JobStatus[] filter type accepts it (not readonly).
const notTerminal = () => ({ notIn: [...TERMINAL_STATUSES] });

/**
 * Apply a RunPod terminal/progress callback to its Job by runpodJobId.
 *
 * Maps the RunPod status via the shared status-map; an unknown status is a no-op.
 * Every write is guarded by `status notIn TERMINAL` so a late/duplicate callback
 * on a settled job is a no-op (idempotent). Returns void in all cases.
 */
export async function applyWebhookResult(body: {
  id: string;
  status: string;
  output?: unknown;
  error?: unknown;
}): Promise<void> {
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) return; // malformed body — caller still returns 200.

  const { id, status, output, error } = parsed.data;
  const mapped = mapRunPodStatus(status);
  if (!mapped) return; // unknown status — no write.

  const where = { runpodJobId: id, status: notTerminal() };
  const out = (output ?? {}) as Record<string, unknown>;

  if (mapped === "completed") {
    await prisma.job.updateMany({
      where,
      data: {
        status: "completed",
        // Persist the worker output so Phase 5 reads layers from the DB.
        result: (output ?? undefined) as never,
        error: null,
        finishedAt: new Date(),
      },
    });
    // OUT-01: record exactly one Layer for this completion. deriveLayerFromResult
    // upserts on {jobId} so a duplicate/late callback (the updateMany above already
    // matched zero rows for a settled job) cannot create a second Layer. reconcile.ts
    // replays through this same writer, so the cron fallback gets layer creation for
    // free — no second code path. We need the Job's id + combo, which the webhook body
    // (keyed by runpodJobId) does not carry, so look it up post-write.
    const job = await prisma.job.findFirst({
      where: { runpodJobId: id },
      select: { id: true, combo: true, intelState: true },
    });
    if (job) {
      await deriveLayerFromResult(job.id, job.combo as Combo | null, output);

      // INTEL-04 (Phase 9, T-09-09): a completed INTELLIGENCE-PREVIEW job is
      // flipped to ANALYZING so the cron sweep picks it up. ONLY the state flip
      // happens here — the slow vision call NEVER runs on the webhook (RunPod
      // retries slow callbacks). The guarded updateMany makes a duplicate/late
      // completion (already flipped or already analyzed) match zero rows — no
      // double-flip, no double analysis. A classic job (intelState null) takes
      // the byte-identical pre-Phase-9 path. The dropped-webhook case is covered
      // for free: reconcile.ts replays through this same writer.
      if (job.intelState === "PREVIEW_QUEUED") {
        await prisma.job.updateMany({
          where: { id: job.id, intelState: "PREVIEW_QUEUED" },
          data: { intelState: "ANALYZING" },
        });
      }
    }
    return;
  }

  if (mapped === "failed") {
    // A2: collapse the worker error/stdout/stderr to the ~4000-char tail of Job.error.
    const rawError =
      (typeof out.error === "string" && out.error) ||
      (typeof error === "string" && error) ||
      JSON.stringify(out);
    await prisma.job.updateMany({
      where,
      data: { status: "failed", error: tail(rawError), finishedAt: new Date() },
    });
    return;
  }

  if (mapped === "in_progress") {
    await prisma.job.updateMany({
      where,
      data: { status: "in_progress", startedAt: new Date() },
    });
    return;
  }

  // in_queue (and any other non-terminal mapped status).
  await prisma.job.updateMany({ where, data: { status: mapped } });
}
