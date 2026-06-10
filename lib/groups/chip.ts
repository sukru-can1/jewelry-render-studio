// Single source of truth for the stone/object group chip color contract
// (Phase 2 §4 / UI-SPEC §4): diamond=primary, stone2=info, stone3=warning,
// alloycolour=neutral, unassigned=dashed muted. OUTLINE-style chips
// (border + text), token-based only — NO raw Tailwind palette colors, NO purple.
//
// Imported by the batch builder (stone-group picker chips) and the group
// assignment surface (per-object group badge) so the contract is defined once.
// The gallery uses a separate FILLED-style map (gallery/layer-card.tsx GROUP_CHIP);
// these are intentionally distinct visual treatments.

// Covers every group key both call sites index into (the batch builder only uses
// the stone-group subset; group assignment also uses alloycolour + unassigned).
export const GROUP_CHIP_CLASS: Record<string, string> = {
  alloycolour: "border-border text-foreground",
  diamond: "border-primary/50 text-primary",
  stone2: "border-info/50 text-info",
  stone3: "border-warning/50 text-warning",
  unassigned: "border-dashed border-border text-muted-foreground",
};
