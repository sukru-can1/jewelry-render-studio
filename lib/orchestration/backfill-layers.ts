// OUT-01 (W3) — one-shot, idempotent backfill of pre-existing completed jobs into
// Layer rows. Jobs that COMPLETED before the webhook layer hook (layers.ts) existed
// have Job.result but no Layer row, so they are invisible in the gallery (Plan 04).
// This future-proofs the gallery against those past completions.
//
// SAFE + idempotent: each matched job is replayed through deriveLayerFromResult, which
// upserts on {jobId} (Layer.jobId @unique) — re-running creates NO duplicates. Bounded:
// it only processes jobs with `layers: { none: {} }`, so each run shrinks the matched
// set to nothing. Invoke once after deploy, or wire into the existing reconcile cron.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { Combo } from "@/lib/batches/expand";
import { deriveLayerFromResult } from "@/lib/orchestration/layers";

export type BackfillResult = { backfilled: number };

/**
 * Replay every already-completed job that has a result but no Layer row through the
 * idempotent layer writer. Returns the count of jobs processed.
 */
export async function backfillCompletedLayers(): Promise<BackfillResult> {
  const jobs = await prisma.job.findMany({
    where: {
      status: "completed",
      layers: { none: {} },
      // Prisma JSON-field null filter: DbNull targets the SQL NULL stored in Job.result.
      result: { not: Prisma.DbNull },
    },
    select: { id: true, combo: true, result: true },
  });

  let backfilled = 0;
  for (const job of jobs) {
    await deriveLayerFromResult(job.id, job.combo as Combo | null, job.result);
    backfilled += 1;
  }

  console.log(`backfillCompletedLayers: processed ${backfilled} completed job(s)`);
  return { backfilled };
}
