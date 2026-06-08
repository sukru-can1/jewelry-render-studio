"use server";

// PROD-03/04 — object→group assignment Server Actions. The core data deliverable
// of Phase 2 and the bridge to Phase 3's batch builder.
//
// saveAssignments persists ONE ObjectGroupAssignment row per NON-EMPTY group
// (delete-and-recreate in a transaction — RESEARCH Pattern 5) with objectTokens
// set to the object SIGNATURES the operator grouped. Those signatures are EXACTLY
// the `contains` tokens Phase-3's lib/enterprise-recipes.ts will match for holdout
// passes (PROD-04: persist the shape ONLY — no recipe generation here).
//
// SECURITY: requireSession() is the FIRST line (T-02-17, fail-closed). The group
// keys are validated against the zod enum before any write (T-02-18); objectTokens
// are stored as opaque strings and React-escapes them on render.
//
// READINESS — ASSUMPTION (RESEARCH Open Q4): status recomputes to 'ready' when
// alloycolour has >=1 token AND no clearly-stone mesh is left unassigned, else
// 'needs_groups'. This heuristic is an ASSUMED contract, NOT a confirmed one.
// Phase 3 MUST revisit/confirm it once it consumes the token shape for holdout
// passes (see 02-04-SUMMARY).

import { revalidatePath } from "next/cache";

import type { typeToFlattenedError } from "zod";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { parseInventory } from "@/lib/inventory";
import { suggestGroup } from "@/lib/tokens";
import {
  assignmentSchema,
  type AssignmentInput,
  type ObjectGroupKey,
} from "@/lib/validation/product";

export type GroupTokenMap = Partial<Record<ObjectGroupKey, string[]>>;

type SaveResult =
  | { ok: true; status: string }
  | { ok: false; issues: typeToFlattenedError<AssignmentInput> };

/**
 * A mesh is "clearly stone" when token-assist would route it to one of the three
 * stone groups (diamond/stone2/stone3). The readiness rule wants every such mesh
 * grouped before a product is 'ready'.
 */
function isStoneMesh(signature: string): boolean {
  const g = suggestGroup(signature);
  return g === "diamond" || g === "stone2" || g === "stone3";
}

/**
 * Recompute the product status from the saved groups + the inspected inventory.
 * ASSUMPTION (Open Q4): 'ready' iff alloycolour has >=1 token AND no clearly-stone
 * mesh is left unassigned; else 'needs_groups'.
 */
function recomputeStatus(
  groups: GroupTokenMap,
  signatures: string[],
): "ready" | "needs_groups" {
  const assigned = new Set<string>();
  for (const tokens of Object.values(groups)) {
    for (const t of tokens ?? []) assigned.add(t);
  }

  const hasAlloy = (groups.alloycolour ?? []).length >= 1;
  const stoneMeshUnassigned = signatures.some(
    (sig) => isStoneMesh(sig) && !assigned.has(sig),
  );

  return hasAlloy && !stoneMeshUnassigned ? "ready" : "needs_groups";
}

/**
 * Persist object→group assignments for a product and recompute its status.
 *
 * - requireSession() first (T-02-17).
 * - assignmentSchema validates the group keys (enum) + token arrays (T-02-18);
 *   an unknown group key rejects with NO write.
 * - delete-and-recreate ONE row per non-empty group in a $transaction (Pattern 5).
 * - objectTokens are the provided SIGNATURES (PROD-04) — never row ids.
 * - status recomputes to ready/needs_groups (Open-Q4 ASSUMPTION).
 */
export async function saveAssignments(
  productId: string,
  groups: GroupTokenMap,
): Promise<SaveResult> {
  await requireSession();

  const parsed = assignmentSchema.safeParse({ productId, groups });
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.flatten() };
  }

  const { groups: validGroups } = parsed.data;

  // One row per NON-EMPTY group; empty groups are skipped (not persisted).
  const rows = (Object.entries(validGroups) as [ObjectGroupKey, string[]][])
    .filter(([, tokens]) => Array.isArray(tokens) && tokens.length > 0)
    .map(([group, objectTokens]) => ({ productId, group, objectTokens }));

  // Delete-and-recreate (Pattern 5): atomic replacement of the product's groups.
  await prisma.$transaction([
    prisma.objectGroupAssignment.deleteMany({ where: { productId } }),
    prisma.objectGroupAssignment.createMany({ data: rows }),
  ]);

  // Recompute status from the latest inspection inventory (clearly-stone coverage).
  const inspection = await prisma.inspection.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
  });
  const signatures = inspection?.inventory
    ? parseInventory(inspection.inventory).objects.map((o) => o.signature)
    : [];

  const status = recomputeStatus(validGroups as GroupTokenMap, signatures);

  await prisma.product.update({
    where: { id: productId },
    data: { status },
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");

  return { ok: true, status };
}

/**
 * Load the saved assignments for a product as a { group: tokens } map. Round-trips
 * a save — the assignment surface uses it to hydrate its initial state on revisit.
 */
export async function loadAssignments(productId: string): Promise<GroupTokenMap> {
  await requireSession();

  const rows = await prisma.objectGroupAssignment.findMany({
    where: { productId },
  });

  const map: GroupTokenMap = {};
  for (const row of rows) {
    map[row.group as ObjectGroupKey] = row.objectTokens;
  }
  return map;
}
