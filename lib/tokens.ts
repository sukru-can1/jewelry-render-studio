// PROD-03 — token-assist heuristics. Deterministic substring match over an
// object signature → one of the four canonical groups. The operator ACCEPTS a
// suggestion in the UI; suggestGroup is never auto-applied here (that is the
// assignment surface's job). Rule table from RESEARCH Pattern 6, aligned with the
// CLAUDE.md material-system name patterns (metal_*/band_*/prong_*).

const RULES: { group: string; contains: string[] }[] = [
  { group: "alloycolour", contains: ["metal", "band", "prong", "shank", "alloy"] },
  // NOTE: "round_5"/"round_6" are intentionally NOT diamond tokens — they
  // collide with the stone2 "round_" prefix and the behavior contract requires
  // "round_5 side" → stone2. The center stone reaches "diamond" via
  // center/solitaire/diamond/main instead.
  { group: "diamond", contains: ["center", "solitaire", "diamond", "main"] },
  { group: "stone2", contains: ["side", "round_", "stone2", "halo"] },
  { group: "stone3", contains: ["accent", "stone3", "pave", "melee"] },
];

/**
 * Suggest a canonical group for an object signature. Deterministic: first rule
 * whose contains-token appears in the lowercased signature wins. Returns null
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
