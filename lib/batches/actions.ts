"use server";

// BATCH-06 / BATCH-07 + security — the createBatch Server Action.
//
// This is the AUTHORITATIVE trust boundary for the batch slice (mirrors
// lib/products/assignments.ts + lib/settings/actions.ts structure):
//   1. requireSession() is the FIRST statement (fail-closed; a thrown 401 Response
//      means NO write — T-03-05 defense-in-depth on top of the route guard).
//   2. The untrusted selection is zod-validated (createBatchSchema) BEFORE any read
//      or write (T-03-01 / V5).
//   3. IDOR + readiness guard: the productId is never trusted — we load the product
//      and reject a missing one OR status !== "ready" with no write (T-03-05, V4,
//      RESEARCH Pitfall 6).
//   4. Unsupported StoneType.key (resolveStoneMaterial null) is rejected before any
//      write — never silently substituted (T-03-07, Pitfall 3).
//   5. The hard cap is RE-ENFORCED server-side: jobCount is recomputed via the same
//      countJobs/BATCH_LIMITS as the client; > HARD_CAP rejects before any write
//      (T-03-04, BATCH-06 — the client estimate is advisory only).
//   6. Recipes are GENERATED server-side from validated keys via buildEnterpriseRecipe
//      (through expandCombos) — the action NEVER accepts a client recipe (T-03-06).
//   7. The Batch + all N Jobs are created in ONE prisma.$transaction (all-or-none;
//      a throw mid-tx rolls everything back — T-03-09, BATCH-07).
//
// Phase 3/4 BOUNDARY: this module does NOT import @/lib/runpod and does NOT dispatch.
// Jobs are created status "queued"; Phase 4 owns submission. Duplicate-submit is
// guarded at the client (UI-SPEC submitting state, wired in 03-03) — the action is
// otherwise all-or-none per request, so a retry never leaves a partial batch.

import { revalidatePath } from "next/cache";

import type { typeToFlattenedError } from "zod";
import type { Prisma } from "@prisma/client";

import { requireSession } from "@/lib/auth/rbac";
import {
  resolveMetal,
  resolveStoneMaterial,
  viewKeyToAngle,
} from "@/lib/batches/binding";
import { BATCH_LIMITS, countJobs } from "@/lib/batches/estimate";
import {
  expandCombos,
  buildPasses,
  type Pass,
  type StoneGroupKey,
} from "@/lib/batches/expand";
import { prisma } from "@/lib/db/prisma";
import type {
  EnterpriseGroupTokens,
  EnterpriseStoneMaterial,
} from "@/lib/enterprise-recipes";
import {
  createBatchSchema,
  type CreateBatchInput,
} from "@/lib/validation/batch";

export type CreateBatchResult =
  | { ok: true; batchId: string; jobCount: number }
  | { ok: false; error: string }
  | { ok: false; issues: typeToFlattenedError<CreateBatchInput> };

const STONE_GROUPS: readonly StoneGroupKey[] = ["diamond", "stone2", "stone3"];

/**
 * Preview-first default sampling/resolution used only when the named QualityPreset
 * row is absent (RESEARCH: preview is the safe default). A seeded named preset
 * always takes precedence — this guarantees a render never lacks samples/width.
 */
const DEFAULT_QUALITY = { samples: 64, width: 1024 } as const;

/**
 * Create a queued Batch and its fan-out of queued Jobs for a validated selection.
 * Fails closed at every boundary; writes nothing unless the whole fan-out succeeds.
 */
export async function createBatch(input: unknown): Promise<CreateBatchResult> {
  // (1) AUTH first — fail-closed. A thrown 401/403 Response propagates (no write).
  const session = await requireSession();

  // (2) Validate the untrusted selection BEFORE any read/write.
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.flatten() };
  }
  const selection = parsed.data;

  // (3) IDOR + readiness guard — never trust the client productId. Load the product
  //     WITH its saved group assignments in one query (the assignments are the
  //     groupTokens source; an empty/absent assignment means a non-buildable product).
  const product = await prisma.product.findUnique({
    where: { id: selection.productId },
    include: { assignments: true },
  });
  if (!product || product.status !== "ready") {
    return { ok: false, error: "Product not found or not ready for batching." };
  }

  // (4) Project the product's saved assignment rows -> groupTokens + present groups.
  const assignmentRows = product.assignments ?? [];
  const groupTokens: EnterpriseGroupTokens = {
    alloycolour: [],
    diamond: [],
    stone2: [],
    stone3: [],
  };
  for (const row of assignmentRows) {
    if (row.group in groupTokens) {
      groupTokens[row.group as keyof EnterpriseGroupTokens] = row.objectTokens;
    }
  }
  const presentStoneGroups = STONE_GROUPS.filter(
    (g) => groupTokens[g].length > 0,
  );

  // (5) Resolve every selected StoneType.key -> generator material; reject unsupported.
  //     Build a FULL stoneMaterials map (Pitfall 4): absent groups default to "diamond".
  const stoneMaterials: Record<StoneGroupKey, EnterpriseStoneMaterial> = {
    diamond: "diamond",
    stone2: "diamond",
    stone3: "diamond",
  };
  for (const group of STONE_GROUPS) {
    const stoneTypeKey = selection.stoneTypeByGroup[group];
    if (!stoneTypeKey) continue;
    const material = resolveStoneMaterial(stoneTypeKey);
    if (material === null) {
      return { ok: false, error: `Unsupported stone type: ${stoneTypeKey}.` };
    }
    stoneMaterials[group] = material;
  }

  // (6) Resolve angles (curate >4 views -> null) and metals (reject unknown).
  const angles = selection.angleViewKeys
    .map((key) => viewKeyToAngle(key, selection.angleViewKeys))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const resolvedMetals: NonNullable<ReturnType<typeof resolveMetal>>[] = [];
  for (const key of selection.metalKeys) {
    const metal = resolveMetal(key);
    if (metal === null) {
      return { ok: false, error: `Unsupported metal: ${key}.` };
    }
    resolvedMetals.push(metal);
  }

  // (7) Build the layered pass set (metal-only + present+selected stone groups).
  const selectedPasses = selection.passes as ("metal" | StoneGroupKey)[];
  const passes: Pass[] = buildPasses(presentStoneGroups, selectedPasses);

  if (angles.length === 0 || resolvedMetals.length === 0 || passes.length === 0) {
    return { ok: false, error: "Selection resolves to zero renderable jobs." };
  }

  // (8) SERVER-SIDE CAP (BATCH-06 / T-03-04). Recompute the requested matrix size
  //     from the VALIDATED selection using the SAME formula the client's advisory
  //     estimate uses (adapter contract: |angleViewKeys| × |metalKeys| × passCount).
  //     The client number is never trusted; reject > HARD_CAP BEFORE any read of the
  //     quality preset or any write. `passCount` counts the metal pass + the
  //     present+selected stone-group passes (== |passes|).
  const requestedCount = countJobs({
    angleCount: selection.angleViewKeys.length,
    metalCount: selection.metalKeys.length,
    passCount: passes.length,
  });
  if (requestedCount > BATCH_LIMITS.HARD_CAP) {
    return {
      ok: false,
      error: `Batch of ${requestedCount} jobs exceeds the hard cap of ${BATCH_LIMITS.HARD_CAP}.`,
    };
  }

  // (9) Load the chosen QualityPreset for samples + resolution (width). A "preview"
  //     default (RESEARCH: preview-first) is used only if the named preset is absent,
  //     so a render never lacks sampling/resolution; the named preset always wins.
  const quality =
    (await prisma.qualityPreset?.findFirst?.({
      where: { key: selection.qualityKey },
    })) ?? DEFAULT_QUALITY;

  // The authoritative count of jobs actually written = the RESOLVED matrix (angles
  // curated to <=4 by binding). This is what hits the GPU downstream and is stored
  // on the Batch; it is always <= requestedCount, so the cap above is conservative.
  const jobCount = countJobs({
    angleCount: angles.length,
    metalCount: resolvedMetals.length,
    passCount: passes.length,
  });

  // Expand to one combo + generated recipe per (angle × metal × pass). Recipes are
  // produced by buildEnterpriseRecipe (reuse, never hand-built) — T-03-06.
  const expanded = expandCombos({
    angles,
    metals: resolvedMetals,
    passes,
    groupTokens,
    productName: product.name ?? "product",
    resolution: quality.width,
    samples: quality.samples,
    stoneMaterials,
  });

  // matrix = the selection snapshot persisted on the Batch for audit/reproduction.
  const matrix = {
    angleViewKeys: selection.angleViewKeys,
    metalKeys: selection.metalKeys,
    stoneTypeByGroup: selection.stoneTypeByGroup,
    passes: selection.passes,
    qualityKey: selection.qualityKey,
    resolvedAngles: angles,
    resolvedMetals,
  };

  // (10) ONE all-or-none transaction: create the Batch (queued) then all N Jobs.
  //      A throw inside (e.g. createMany rejects) rolls back the Batch too (BATCH-07).
  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.batch.create({
      data: {
        productId: selection.productId,
        createdById: session.user.id,
        status: "queued",
        matrix: matrix as Prisma.InputJsonValue,
        jobCount,
      },
    });

    await tx.job.createMany({
      data: expanded.map((row) => ({
        batchId: created.id,
        status: "queued" as const,
        combo: row.combo as Prisma.InputJsonValue,
        recipe: row.recipe as Prisma.InputJsonValue,
      })),
    });

    return created;
  });

  revalidatePath(`/products/${selection.productId}`);

  return { ok: true, batchId: batch.id, jobCount };
}
