// BATCH-01/02/03 — pure data-prep for the Batch Builder RSC page.
//
// SINGLE SOURCE for the branch logic the builder page renders against: (a) is this
// product buildable (ready + has a saved assignment), and (b) which stone groups are
// PRESENT on it, and (c) the supported StoneType subset the picker may show. Kept
// pure (no Prisma, no React) so the RSC render-data branch is unit-testable in the
// existing harness style — the page wires the prisma reads, this decides the shape.

import { isSupportedStoneType } from "@/lib/batches/binding";
import type { GroupTokenMap } from "@/lib/products/assignments";

/** The three non-alloy stone groups, in canonical order. */
export const STONE_GROUPS = ["diamond", "stone2", "stone3"] as const;
export type StoneGroupKey = (typeof STONE_GROUPS)[number];

/** A StoneType domain row reduced to what the picker shows (key + label). */
export type StoneTypeOption = { key: string; label: string };

/**
 * Buildable iff the product status is "ready" AND it has at least one saved
 * assignment row. Mirrors the server action's readiness guard (a non-ready product
 * never holds authority) — the page renders the no-assignment empty state otherwise.
 */
export function isBuildable(
  status: string,
  assignmentRowCount: number,
): boolean {
  return status === "ready" && assignmentRowCount > 0;
}

/**
 * Which stone groups the product actually has (a group with >=1 saved token). Only
 * these get a stone-type picker row + a holdout pass toggle (BATCH-03/04). Returned
 * in canonical diamond->stone2->stone3 order.
 */
export function presentStoneGroups(
  assignments: GroupTokenMap,
): StoneGroupKey[] {
  return STONE_GROUPS.filter((g) => (assignments[g]?.length ?? 0) > 0);
}

/**
 * The StoneType catalog filtered to generator-supported types only (BATCH-03 / T-03-11):
 * the picker MUST NOT offer a type the recipe generator can't honor — the server
 * re-validates, so an unsupported key fails closed regardless.
 */
export function supportedStoneTypes(
  stoneTypes: StoneTypeOption[],
): StoneTypeOption[] {
  return stoneTypes.filter((s) => isSupportedStoneType(s.key));
}
