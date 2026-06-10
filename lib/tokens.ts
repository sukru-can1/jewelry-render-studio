// PROD-03 — token-assist heuristics. Deterministic substring match over an
// object signature → one of the four canonical groups. The operator ACCEPTS a
// suggestion in the UI; suggestGroup is never auto-applied here (that is the
// assignment surface's job). Rule table from RESEARCH Pattern 6, aligned with the
// CLAUDE.md material-system name patterns (metal_*/band_*/prong_*).
//
// Rule ORDER is stone-first (stone2 → stone3 → diamond → alloycolour), porting the
// legacy Flask renderer's proven behavior: a stone sitting in a metal setting must
// classify as a stone, not metal. Keyword lists are expanded from the legacy app's
// STONE_KW / METAL_KW (external-work/cloud-renderer-glmr/app.py).

import type { InventoryObject, InventoryMaterial } from "@/lib/inventory";

const RULES: { group: string; contains: string[] }[] = [
  // Side stones first — a "round_5 side" stone in a metal setting is a stone.
  { group: "stone2", contains: ["side", "round_", "stone2", "halo"] },
  // Accent / pavé / melee stones.
  { group: "stone3", contains: ["accent", "stone3", "pave", "melee"] },
  // Center stone + generic-stone fallback. The generic gemstone keywords are
  // ported from legacy STONE_KW so any unlabeled gem still routes to a stone
  // group rather than falling through to metal.
  {
    group: "diamond",
    contains: [
      "center",
      "solitaire",
      "diamond",
      "main",
      "gem",
      "gemstone",
      "brilliant",
      "brillant",
      "ruby",
      "sapphire",
      "emerald",
      "amethyst",
      "topaz",
      "garnet",
      "opal",
      "pearl",
      "zirconia",
      "moissanite",
      "tourmaline",
      "peridot",
      "citrine",
      "tanzanite",
      "morganite",
      "aquamarine",
      "rhodolite",
      "tsavorite",
      "swarovsky",
    ],
  },
  // Metal last — porting legacy METAL_KW. Only objects that matched no stone
  // token above can land here.
  {
    group: "alloycolour",
    contains: [
      "metal",
      "band",
      "prong",
      "shank",
      "alloy",
      "gold",
      "silver",
      "platinum",
      "basket",
      "bezel",
      "setting",
      "gallery",
      "bridge",
      "rail",
      "head",
      "frame",
    ],
  },
];

/**
 * Suggest a canonical group for an object signature. Deterministic: first rule
 * whose contains-token appears in the lowercased signature wins. Stone-first
 * order ensures a stone in a metal setting classifies as a stone. Returns null
 * when nothing matches (the operator must classify it manually).
 */
export function suggestGroup(signature: string): string | null {
  const s = signature.toLowerCase();
  for (const rule of RULES) {
    if (rule.contains.some((token) => s.includes(token))) {
      return rule.group;
    }
  }
  return null;
}

/**
 * Classify an object into a canonical group. Name-based suggestGroup is tried
 * first; when the signature is too generic to match any token, fall back to the
 * object's BSDF material properties:
 *   - any slot material with transmission > 0.5 OR ior >= 1.6 → "diamond"
 *     (transmissive / high-IOR = a gemstone)
 *   - else any slot material with metallic > 0.5 → "alloycolour"
 *   - else null (operator must classify manually)
 * Pure: no side effects.
 */
export function classifyObject(
  obj: InventoryObject,
  materials: InventoryMaterial[],
): string | null {
  const byName = suggestGroup(obj.signature);
  if (byName !== null) return byName;

  const byMaterialName = new Map(materials.map((m) => [m.name, m]));
  const slotMaterials = obj.materialSlots
    .filter((slot): slot is string => typeof slot === "string")
    .map((slot) => byMaterialName.get(slot))
    .filter((m): m is InventoryMaterial => m !== undefined);

  const isGem = slotMaterials.some(
    (m) =>
      (m.transmission != null && m.transmission > 0.5) ||
      (m.ior != null && m.ior >= 1.6),
  );
  if (isGem) return "diamond";

  const isMetal = slotMaterials.some((m) => m.metallic != null && m.metallic > 0.5);
  if (isMetal) return "alloycolour";

  return null;
}
