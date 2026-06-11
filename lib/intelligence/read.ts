// INTEL-05 (Phase 9, 09-03) — the DB-ONLY intel read for the batch detail page.
//
// Reads Job.intel / Job.intelState straight from Postgres and projects the
// per-job JobIntelView the operator panel renders (scores, flags, deltas,
// rationale, decision, cost, operatorAction, escalation reason). It NEVER talks
// to the GPU provider and never re-derives loop state — the webhook + cron own
// all remote I/O (ORCH-02 stance; enforced by the orch-db-only source guard).
//
// T-09-13: the preview thumbnail is delivered through the auth-gated file proxy
// (privateUrl -> /api/file?pathname=…) — the operator's browser session is
// verified there; a public URL is never built.

import { privateUrl } from "@/lib/blob";
import { prisma } from "@/lib/db/prisma";
import {
  comboLabel,
  normalizeIntel,
  type JobIntelView,
} from "@/lib/intelligence/view";

/** The completed preview's PRIVATE pathname (same mapping layers.ts reads). */
function previewPathname(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const out = result as { image_blob?: { pathname?: unknown }; image_key?: unknown };
  const fromBlob = out.image_blob?.pathname;
  if (typeof fromBlob === "string" && fromBlob.length > 0) return fromBlob;
  const fromKey = out.image_key;
  if (typeof fromKey === "string" && fromKey.length > 0) return fromKey;
  return undefined;
}

/**
 * Load every intelligence job of a batch (intelState NOT null) as a tolerant
 * JobIntelView projection. IDOR scope: the caller (the batch detail page)
 * passes a batch id it already loaded behind requireSession().
 */
export async function loadBatchIntel(batchId: string): Promise<JobIntelView[]> {
  const jobs = await prisma.job.findMany({
    where: { batchId, intelState: { not: null } },
    orderBy: { id: "asc" },
    select: { id: true, intelState: true, intel: true, combo: true, result: true },
  });

  return jobs.map((job) => {
    const intel = normalizeIntel(job.intel);
    const intelState = job.intelState ?? "";
    const pathname = previewPathname(job.result);
    return {
      jobId: job.id,
      intelState,
      comboLabel: comboLabel(job.combo),
      iteration: intel.iteration,
      verdicts: intel.verdicts,
      latestVerdict: intel.verdicts[intel.verdicts.length - 1] ?? null,
      decision: intel.decision ?? null,
      reason: intel.reason ?? null,
      escalateReason:
        intelState === "ESCALATED"
          ? (intel.reason ?? "escalated without a recorded reason")
          : null,
      appliedOverrides: intel.appliedOverrides,
      bestOverrides: intel.bestOverrides ?? null,
      bestScore: intel.bestScore ?? null,
      guardrailHits: intel.guardrailHits,
      cost: intel.cost,
      operatorAction: intel.operatorAction ?? null,
      recommendOnly: intel.recommendOnly === true,
      previewThumbUrl: pathname ? privateUrl(pathname) : null,
      previewJobId: intel.previewJobId ?? null,
      finalJobId: intel.finalJobId ?? null,
    };
  });
}
