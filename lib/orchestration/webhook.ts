// ORCH-02/04 — parse a RunPod terminal callback and write the matching Job
// IDEMPOTENTLY. RunPod delivers the webhook at-least-once (RESEARCH Pitfall 3),
// so every write is guarded by `status notIn TERMINAL`: a duplicate/late callback
// on an already-settled job matches zero rows and clobbers nothing. The body.id
// must match a known runpodJobId for any write to land (T-04-03) — a forged id
// with no matching row writes nothing.

import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
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
