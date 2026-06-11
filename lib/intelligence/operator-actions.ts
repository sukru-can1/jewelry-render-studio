"use server";

// INTEL-05 (Phase 9, 09-03) — the operator Accept / Reject / Override Server
// Action: the human half of the adaptive loop (09-AI-SPEC §7.2 — always on,
// never silent). The UI holds NO authority; this is the trust boundary, shaped
// exactly like lib/batches/actions.ts createBatch:
//
//   1. requireSession() FIRST (fail-closed — a thrown 401 means NO read/write;
//      T-09-10).
//   2. zod-validate the untrusted {jobId, action, overrideIteration} BEFORE any
//      read (an invalid enum never touches the DB).
//   3. IDOR: the job is loaded WITH its batch; a missing job/batch -> {ok:false}
//      with no write (T-09-11). Only SETTLED loop states are reviewable; an
//      already-reviewed job is rejected (one attributed decision per job).
//   4. The decision is logged to Job.intel.operatorAction {action, userId, at}
//      via a GUARDED update (expected prior intelState) that MERGES into the
//      RAW intel Json — the verdicts trace is never clobbered (T-09-12).
//   5. Decisions that ship a render only CREATE a queued classic Job whose
//      recipe comes from buildEnterpriseRecipe (G10 — single quality source);
//      the existing dispatch cron submits it. No GPU client import here, ever.
//      - accept on ESCALATED  -> queue the frozen-best FINAL (bestOverrides);
//        on FINAL_QUEUED/DONE -> log-only (the loop already queued the FINAL).
//      - reject               -> re-queue a PLAIN classic final (no overrides).
//      - override             -> ship the chosen iteration's override set.

import { revalidatePath } from "next/cache";

import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { buildEnterpriseRecipe } from "@/lib/enterprise-recipes";
import type { ProfileOverrides } from "@/lib/intelligence/knobs";
// Type-only: erased at runtime so the AI/blob/sharp stack behind the sweep
// module never loads inside the Server Action (mirrors lib/batches/actions.ts).
import type {
  IntelOperatorAction,
  IntelQuality,
  IntelRequest,
} from "@/lib/intelligence/sweep";
import {
  isReviewable,
  normalizeIntel,
  overridesForIteration,
  readIntelCombo,
} from "@/lib/intelligence/view";
import type { Combo } from "@/lib/batches/expand";

const decisionSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(["accept", "reject", "override"]),
  overrideIteration: z.number().int().min(0).optional(),
});

export type IntelDecisionInput = z.infer<typeof decisionSchema>;

export type IntelDecisionResult = { ok: true } | { ok: false; error: string };

/** G10: the single recipe source — combo + persisted trace context, never JSON. */
function buildShipRecipe(
  combo: Combo,
  request: IntelRequest,
  quality: IntelQuality,
  overrides: ProfileOverrides,
): Record<string, unknown> {
  return buildEnterpriseRecipe({
    angle: combo.angleKey,
    metal: combo.metalKey,
    pass: combo.pass,
    stoneGroup: combo.pass === "stone" ? combo.stoneGroup : undefined,
    groupTokens: request.groupTokens,
    stoneMaterials: request.stoneMaterials,
    productName: request.productName,
    resolution: quality.resolution,
    samples: quality.samples,
    profileOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  });
}

/**
 * Apply one attributed operator decision to a settled intelligence job.
 * Fails closed at every boundary; writes nothing unless the claim succeeds.
 */
export async function applyIntelDecision(
  input: unknown,
): Promise<IntelDecisionResult> {
  // (1) AUTH first — fail-closed. A thrown 401 Response propagates (no write).
  const session = await requireSession();

  // (2) Validate the untrusted decision BEFORE any read/write.
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid operator decision." };
  }
  const { jobId, action, overrideIteration } = parsed.data;

  // (3) IDOR — never trust the client jobId: load the job WITH its batch and
  //     reject a missing one with no write.
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { batch: { select: { id: true, productId: true } } },
  });
  if (!job || !job.batch) {
    return { ok: false, error: "Job not found." };
  }
  if (!job.intelState) {
    return { ok: false, error: "This job is not part of an AI loop." };
  }
  if (!isReviewable(job.intelState)) {
    return {
      ok: false,
      error: "The AI loop is still working on this job — wait for it to settle.",
    };
  }

  const intel = normalizeIntel(job.intel);
  if (intel.operatorAction) {
    return { ok: false, error: "This job has already been reviewed." };
  }

  // (4) Resolve what (if anything) the decision ships. null = log-only.
  let shipOverrides: ProfileOverrides | null = null;
  if (action === "accept") {
    // ESCALATED never queued a FINAL — accepting ships the frozen best set.
    if (job.intelState === "ESCALATED") shipOverrides = intel.bestOverrides ?? {};
  } else if (action === "reject") {
    // Discard the AI result: re-queue a PLAIN classic final (no overrides).
    shipOverrides = {};
  } else {
    if (overrideIteration === undefined) {
      return { ok: false, error: "Pick an iteration to override with." };
    }
    const chosen = overridesForIteration(intel, overrideIteration);
    if (chosen === null) {
      return { ok: false, error: "Unknown iteration." };
    }
    shipOverrides = chosen;
  }

  const combo = readIntelCombo(job.combo);
  const request = intel.request;
  if (shipOverrides !== null && (!combo || !request)) {
    return {
      ok: false,
      error:
        "This job's trace is missing its render context — rebuild the batch instead.",
    };
  }

  const operatorAction: IntelOperatorAction = {
    action,
    userId: session.user.id,
    at: new Date().toISOString(),
    ...(action === "override" ? { overrideIteration } : {}),
  };

  // Merge over the RAW intel Json (not the normalized copy) so unknown/extra
  // trace fields survive verbatim — the audit trail is never clobbered.
  const rawIntel = (
    job.intel && typeof job.intel === "object" ? job.intel : {}
  ) as Record<string, unknown>;
  const expectedState = job.intelState;

  // (5) ONE all-or-none transaction: claim the review (guarded on the expected
  //     prior intelState — a concurrent transition matches zero rows and nothing
  //     ships), then queue the classic follow-up render if the decision needs one.
  const outcome = await prisma.$transaction(async (tx) => {
    const claim = await tx.job.updateMany({
      where: { id: jobId, intelState: expectedState },
      data: {
        intel: { ...rawIntel, operatorAction } as unknown as Prisma.InputJsonValue,
      },
    });
    if (claim.count !== 1) return { claimed: false as const };

    if (shipOverrides === null) return { claimed: true as const };

    const recipe = buildShipRecipe(combo!, request!, request!.final, shipOverrides);
    const created = await tx.job.create({
      data: {
        batchId: job.batchId,
        status: "queued",
        combo: job.combo as Prisma.InputJsonValue,
        recipe: recipe as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Attach the re-queued job id to the logged action (audit link, same guard).
    await tx.job.updateMany({
      where: { id: jobId, intelState: expectedState },
      data: {
        intel: {
          ...rawIntel,
          operatorAction: { ...operatorAction, queuedJobId: created.id },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return { claimed: true as const };
  });

  if (!outcome.claimed) {
    return {
      ok: false,
      error: "The job changed state while you were reviewing — refresh and retry.",
    };
  }

  revalidatePath(`/batches/${job.batchId}`);
  return { ok: true };
}
