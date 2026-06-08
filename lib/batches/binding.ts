// BATCH-03 / BATCH-07 — Domain-key -> recipe-key binding layer.
//
// THE SINGLE SANCTIONED CROSSING from the Admin-editable domain key space
// (CameraView.key / Metal.key / StoneType.key in Postgres) into the hardcoded
// recipe-generator key space (lib/enterprise-recipes.ts). Decision: binding lives
// in ONE module so the client picker, the server fan-out (03-02), and any future
// surface agree byte-for-byte (T-03-02).
//
// PURE module: only TYPE imports from the generator, no runtime dependency, no
// Prisma, no React. Type imports compile away — this stays import-safe everywhere.
import type {
  EnterpriseAngleKey,
  EnterpriseMetal,
  EnterpriseStoneMaterial,
} from "@/lib/enterprise-recipes";

/**
 * Positional angle order. Seeded CameraView keys (view1..view4) map by SORTED index
 * onto this list: view1->hero, view2->front, view3->top, view4->profile.
 */
export const ANGLE_ORDER: readonly EnterpriseAngleKey[] = [
  "hero",
  "front",
  "top",
  "profile",
] as const;

/**
 * Resolve a CameraView.key to a generator angle by its position among ALL view keys
 * (sorted, so the result is independent of input order). The generator only defines
 * 4 angles; a 5th+ view (sorted index >= 4) returns null — the caller curates/skips
 * it rather than crashing (resolve_open_decisions #2: gracefully handle a domain
 * that grows past 4 views).
 */
export function viewKeyToAngle(
  viewKey: string,
  allViewKeys: readonly string[],
): EnterpriseAngleKey | null {
  const sorted = [...allViewKeys].sort();
  const index = sorted.indexOf(viewKey);
  if (index < 0 || index >= ANGLE_ORDER.length) return null;
  return ANGLE_ORDER[index];
}

/**
 * Metal.key (white/yellow/red) -> generator EnterpriseMetal. The domain calls rose
 * gold "red"; the generator calls it "rose" (BATCH-07).
 */
export const METAL_MAP: Record<string, EnterpriseMetal> = {
  white: "white",
  yellow: "yellow",
  red: "rose",
};

/** Resolve a Metal.key to a generator metal key, or null for an unknown key. */
export function resolveMetal(metalKey: string): EnterpriseMetal | null {
  return METAL_MAP[metalKey] ?? null;
}

/**
 * Every one of the 10 seeded StoneType keys -> the nearest generator-supported
 * material (diamond/sapphire/emerald/ruby). The recipe generator only ships these
 * four stone presets, so the operator picker is restricted to mappable types and the
 * server rejects anything else (T-03-02, RESEARCH Pitfall 3). The full StoneType.key
 * is still PERSISTED on the batch; only the resolved material crosses into the recipe.
 *
 * Planner mappings (resolve_open_decisions #1):
 *   diamond / black_diamond / moissanite -> diamond (diamond-family optics)
 *   ruby / morganite                     -> ruby    (warm red/pink gem)
 *   sapphire / pink_sapphire / amethyst / aquamarine -> sapphire (cool blue/violet gem)
 *   emerald                              -> emerald
 *
 * NOTE (future extension): the broader 10-type catalog is intentionally collapsed
 * onto 4 materials here. When the recipe generator gains more stone presets, extend
 * this map (and EnterpriseStoneMaterial) rather than scattering substitutions.
 */
export const STONE_MATERIAL_MAP: Record<string, EnterpriseStoneMaterial> = {
  diamond: "diamond",
  black_diamond: "diamond",
  moissanite: "diamond",
  ruby: "ruby",
  morganite: "ruby",
  sapphire: "sapphire",
  pink_sapphire: "sapphire",
  amethyst: "sapphire",
  aquamarine: "sapphire",
  emerald: "emerald",
};

/**
 * Resolve a StoneType.key to a generator stone material, or null if unsupported.
 * The caller (03-02) rejects a null rather than emitting a material the worker
 * cannot honor.
 */
export function resolveStoneMaterial(
  stoneTypeKey: string,
): EnterpriseStoneMaterial | null {
  return STONE_MATERIAL_MAP[stoneTypeKey] ?? null;
}

/** True iff `resolveStoneMaterial` returns a non-null material for this key. */
export function isSupportedStoneType(stoneTypeKey: string): boolean {
  return resolveStoneMaterial(stoneTypeKey) !== null;
}
