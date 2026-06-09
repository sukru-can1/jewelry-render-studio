// COMP-02 — PURE validation gate. Given plain numbers (dimensions + alpha stats
// the route reads from sharp metadata()/stats()), return the warnings that must
// BLOCK or ADVISE a flatten. COMP-02's rule is "empty/mismatched layers must WARN,
// not silently flatten" — so a non-empty result means the route writes NOTHING.
//
// PURE: operates on plain numbers only — never imports sharp/blob/prisma/react.

/** A structured, UI-safe warning. `missing-base` + `dimension-mismatch` +
 *  `empty-layer` are hard-blocks (no deliverable written); `no-overlays` is
 *  advisory (a metal-only product may still flatten base-only via ?force=1). */
export type FlattenWarning = {
  code: "missing-base" | "dimension-mismatch" | "empty-layer" | "no-overlays";
  message: string;
  layer?: { pass: string; stoneGroup?: string; url: string };
  detail?: {
    expectedWidth?: number;
    expectedHeight?: number;
    actualWidth?: number;
    actualHeight?: number;
    alphaMean?: number;
    alphaMax?: number;
  };
};

/** Per-overlay numbers the route extracts from sharp before calling the gate. */
export type OverlayStats = {
  pass?: string;
  stoneGroup?: string;
  url?: string;
  width: number;
  height: number;
  alphaMax: number; // channels[3].max (0 => fully transparent)
  alphaMean: number; // channels[3].mean (coverage proxy, 0..255)
};

export type ValidateInput = {
  base?: { width: number; height: number };
  overlays: OverlayStats[];
  /** Minimum alpha mean (0..255) below which an overlay is "empty". Default 1.0. */
  minAlphaMean?: number;
};

function overlayRef(o: OverlayStats) {
  return { pass: o.pass ?? "stone", stoneGroup: o.stoneGroup, url: o.url ?? "" };
}

/**
 * Validate a variant's geometry + alpha. Returns FlattenWarning[]; an empty array
 * means PASS (safe to composite). Codes can stack (e.g. missing-base + empty-layer).
 */
export function validateVariant(input: ValidateInput): FlattenWarning[] {
  const { base, overlays } = input;
  const minAlphaMean = input.minAlphaMean ?? 1.0;
  const warnings: FlattenWarning[] = [];

  // missing-base — cannot produce a correct deliverable without the metal floor.
  if (!base) {
    warnings.push({
      code: "missing-base",
      message: "No metal (base) layer for this variant — cannot flatten.",
    });
  }

  // no-overlays — advisory; a metal-only product may still flatten base-only.
  if (overlays.length === 0) {
    warnings.push({
      code: "no-overlays",
      message: "No stone overlay layers for this variant (metal-only).",
    });
  }

  for (const o of overlays) {
    // dimension-mismatch — every overlay must match the base exactly so the
    // 0,0-origin composite aligns. Only checkable when a base exists.
    if (base && (o.width !== base.width || o.height !== base.height)) {
      warnings.push({
        code: "dimension-mismatch",
        message: `Overlay ${o.stoneGroup ?? "(stone)"} is ${o.width}×${o.height}, base is ${base.width}×${base.height}.`,
        layer: overlayRef(o),
        detail: {
          expectedWidth: base.width,
          expectedHeight: base.height,
          actualWidth: o.width,
          actualHeight: o.height,
        },
      });
    }

    // empty-layer — fully transparent (alphaMax 0) or below the coverage floor.
    if (o.alphaMax === 0 || o.alphaMean < minAlphaMean) {
      warnings.push({
        code: "empty-layer",
        message: `Overlay ${o.stoneGroup ?? "(stone)"} has no visible pixels (alpha mean ${o.alphaMean.toFixed(2)}).`,
        layer: overlayRef(o),
        detail: { alphaMean: o.alphaMean, alphaMax: o.alphaMax },
      });
    }
  }

  return warnings;
}
