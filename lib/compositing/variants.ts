// COMP-02 — PURE compositing-variant grouping. Turns a flat list of Layer+combo
// rows into one bucket per COMPOSITING VARIANT = (angleKey × metalKey). The base
// is the single pass:"metal" layer; the overlays are every pass:"stone" layer in
// deterministic z-order.
//
// This is NOT lib/gallery/group.ts's "variant" mode — that bucket splits by stone
// group and IGNORES angle (RESEARCH Pitfall 1), so it can never hold all the passes
// for one (angle,metal) together. We do not overload group.ts (it is guarded by
// test/out-gallery-group.test.ts); this is the dedicated compositing key.
//
// PURE module: no prisma, no react, no @/lib/runpod, no sharp, no blob. Reuses
// only the LayerCombo *type* from group.ts so the combo coordinate shape stays
// single-sourced.

import type { LayerCombo } from "@/lib/gallery/group";

/** A single layer feeding a composite, after grouping. `url` is the BLOB PATHNAME
 *  (never a public/signed URL — SEC-02); the route reads it via get(private). */
export type CompositingLayer = {
  pass: string; // "metal" | "stone"
  stoneGroup?: string; // present for stone passes
  url: string; // BLOB PATHNAME
  format: string;
  sortOrder?: number; // z-order hint (from ObjectGroup), optional
};

/** One compositing variant: a metal base + its stone overlays in z-order. */
export type Variant = {
  key: string; // `${angleKey}:${metalKey}`
  angleKey: string;
  metalKey: string;
  base?: CompositingLayer; // the metal pass; undefined => missing-base downstream
  overlays: CompositingLayer[]; // stone passes, deterministically z-ordered
};

/** Minimal shape this grouper needs from a gallery/DB layer row. `combo` carries
 *  the canonical (angleKey/metalKey/pass/stoneGroup[/sortOrder]) coordinate. */
export type LayerWithCombo = {
  id: string;
  pass: string;
  url: string;
  format: string;
  combo: LayerCombo | Record<string, unknown> | null | undefined;
  sortOrder?: number;
};

function comboOf(row: LayerWithCombo): LayerCombo & { sortOrder?: number } {
  const c = row.combo;
  if (c && typeof c === "object") return c as LayerCombo & { sortOrder?: number };
  return {};
}

function toCompositingLayer(
  row: LayerWithCombo,
  combo: LayerCombo & { sortOrder?: number },
): CompositingLayer {
  return {
    pass: row.pass,
    stoneGroup: combo.stoneGroup,
    url: row.url,
    format: row.format,
    // sortOrder may live on the row or inside the combo coordinate.
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : combo.sortOrder,
  };
}

/**
 * Group rows into compositing variants keyed by `${angleKey}:${metalKey}`.
 *
 * - base = the single `pass === "metal"` layer for that key (undefined if none →
 *   drives the `missing-base` warning in validate.ts).
 * - overlays = every `pass === "stone"` layer, sorted ascending by
 *   (sortOrder ?? Infinity, stoneGroup) so the z-order is deterministic and stable.
 * - A row whose combo lacks angleKey/metalKey reads both as undefined and collapses
 *   into a single `undefined:undefined` bucket (mirrors group.ts's guard).
 *
 * Variant order follows first-seen insertion order (deterministic for a
 * deterministically-ordered input).
 */
export function groupVariantsForCompositing(
  rows: readonly LayerWithCombo[],
): Variant[] {
  const buckets = new Map<string, Variant>();

  for (const row of rows) {
    const combo = comboOf(row);
    const angleKey = combo.angleKey as string | undefined;
    const metalKey = combo.metalKey as string | undefined;
    const key = `${angleKey}:${metalKey}`;

    let variant = buckets.get(key);
    if (!variant) {
      variant = {
        key,
        angleKey: angleKey as string,
        metalKey: metalKey as string,
        base: undefined,
        overlays: [],
      };
      buckets.set(key, variant);
    }

    const layer = toCompositingLayer(row, combo);
    if (row.pass === "metal") {
      // Keep the FIRST metal pass as the base; a duplicate is ignored (one base).
      if (!variant.base) variant.base = layer;
    } else if (row.pass === "stone") {
      variant.overlays.push(layer);
    }
    // Any other pass value is not part of the metal/stone composite — ignored.
  }

  for (const variant of buckets.values()) {
    variant.overlays.sort(compareOverlays);
  }

  return [...buckets.values()];
}

/** Deterministic overlay order: (sortOrder ?? Infinity) ascending, then stoneGroup
 *  ascending (undefined stoneGroup sorts as "" — stable, no NaN comparisons). */
function compareOverlays(a: CompositingLayer, b: CompositingLayer): number {
  const sa = typeof a.sortOrder === "number" ? a.sortOrder : Infinity;
  const sb = typeof b.sortOrder === "number" ? b.sortOrder : Infinity;
  if (sa !== sb) return sa - sb;
  return (a.stoneGroup ?? "").localeCompare(b.stoneGroup ?? "");
}
