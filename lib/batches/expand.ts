// BATCH-04 / BATCH-07 / BATCH-03 — Pure combo expansion + recipe-per-combo.
//
// Turns a validated, already-resolved selection (generator-space angle/metal keys +
// the product's group token signatures) into the cartesian list of combos and ONE
// generated recipe per combo. The recipe is produced VERBATIM by the shared, pure
// `buildEnterpriseRecipe` (RESEARCH Pattern 3 / "Don't Hand-Roll") — this module
// NEVER hand-builds recipe JSON.
//
// PURE module: imports only the generator (type + function) and is side-effect free.
// No Prisma, no React, no `@/lib/runpod`. Safe to unit-test with the real generator.
import {
  buildEnterpriseRecipe,
  type EnterpriseAngleKey,
  type EnterpriseGroupTokens,
  type EnterpriseMetal,
  type EnterpriseStoneMaterial,
} from "@/lib/enterprise-recipes";

/** The non-alloy stone groups whose holdout passes carry a stone material. */
export type StoneGroupKey = "diamond" | "stone2" | "stone3";

/**
 * One pass in the render set. The `full` beauty pass is the PRIMARY catalog
 * output — every angle × metal combination gets one BY DEFAULT (buildPasses
 * always emits it first). The metal-only (alloy) pass and the per-group stone
 * passes are SECONDARY compositing layers: metal carries no stone group; each
 * stone pass names exactly one present+selected stone group.
 */
export type Pass =
  | { pass: "full" }
  | { pass: "metal" }
  | { pass: "stone"; stoneGroup: StoneGroupKey };

/** The pass keys an operator may select ("full" is implicit but dedupable). */
export type SelectablePassKey = "full" | "metal" | StoneGroupKey;

/** The (angle × metal × pass) coordinate persisted on each Job (`combo` Json). */
export type Combo = {
  angleKey: EnterpriseAngleKey;
  metalKey: EnterpriseMetal;
  pass: "full" | "metal" | "stone";
  stoneGroup?: StoneGroupKey;
};

/** One expanded row: the combo coordinate + its generated recipe. */
export type ExpandedJob = {
  combo: Combo;
  recipe: Record<string, unknown>;
};

const STONE_GROUP_ORDER: readonly StoneGroupKey[] = [
  "diamond",
  "stone2",
  "stone3",
] as const;

/**
 * Build the pass set (BATCH-04 + the full-pass-first contract):
 *  - ALWAYS one `{ pass: "full" }` FIRST — the primary beauty render every
 *    angle × metal combination ships by default. An explicitly selected "full"
 *    is deduped into this single pass (never two full jobs per combination);
 *  - one `{ pass: "metal" }` whenever "metal" is selected (alloy holdout layer);
 *  - one `{ pass: "stone", stoneGroup: g }` for each stone group g that is BOTH
 *    PRESENT on the product AND selected, in canonical diamond->stone2->stone3 order.
 * `|passes|` equals the estimate's passCount (the full pass counts).
 */
export function buildPasses(
  presentStoneGroups: readonly StoneGroupKey[],
  selectedPasses: readonly SelectablePassKey[],
): Pass[] {
  const present = new Set(presentStoneGroups);
  const selected = new Set(selectedPasses);
  // The full beauty pass is unconditional (and deduped vs. an explicit "full"
  // selection by the Set above): the app's primary output is the full render;
  // metal/stone layers are secondary compositing outputs.
  const passes: Pass[] = [{ pass: "full" }];

  if (selected.has("metal")) {
    passes.push({ pass: "metal" });
  }

  for (const group of STONE_GROUP_ORDER) {
    if (present.has(group) && selected.has(group)) {
      passes.push({ pass: "stone", stoneGroup: group });
    }
  }

  return passes;
}

export type ExpandInput = {
  /** Generator-space angle keys, already mapped via binding.viewKeyToAngle. */
  angles: readonly EnterpriseAngleKey[];
  /** Generator-space metal keys, already mapped via binding.resolveMetal (red->rose). */
  metals: readonly EnterpriseMetal[];
  /** Pass set from `buildPasses`. */
  passes: readonly Pass[];
  /** Product group token signatures; absent groups are [] (generator falls back). */
  groupTokens: EnterpriseGroupTokens;
  productName: string;
  resolution: number;
  samples: number;
  /**
   * FULL material map for all three stone groups. Absent groups MUST still carry a
   * sensible default (e.g. "diamond") so the generator's material_map never reads an
   * undefined material (RESEARCH Pitfall 4).
   */
  stoneMaterials: Record<StoneGroupKey, EnterpriseStoneMaterial>;
};

/**
 * Expand a selection into one row per (angle × metal × pass) in deterministic
 * nested-loop order (angle outer, metal middle, pass inner). Each row's recipe comes
 * from a single `buildEnterpriseRecipe` call with the mapped angle/metal/pass and the
 * full stoneMaterials map — recipes are REUSED, never re-derived (BATCH-07).
 */
export function expandCombos(input: ExpandInput): ExpandedJob[] {
  const rows: ExpandedJob[] = [];

  for (const angle of input.angles) {
    for (const metal of input.metals) {
      for (const p of input.passes) {
        const combo: Combo =
          p.pass === "stone"
            ? {
                angleKey: angle,
                metalKey: metal,
                pass: "stone",
                stoneGroup: p.stoneGroup,
              }
            : { angleKey: angle, metalKey: metal, pass: p.pass };

        const recipe = buildEnterpriseRecipe({
          angle,
          metal,
          pass: p.pass,
          stoneGroup: p.pass === "stone" ? p.stoneGroup : undefined,
          groupTokens: input.groupTokens,
          stoneMaterials: input.stoneMaterials,
          productName: input.productName,
          resolution: input.resolution,
          samples: input.samples,
        });

        rows.push({ combo, recipe });
      }
    }
  }

  return rows;
}
