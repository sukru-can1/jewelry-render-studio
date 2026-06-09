// OUT-02 — pure layer grouping for the outputs gallery.
//
// Buckets Layer+combo rows by the CANONICAL combo keys (angleKey / metalKey /
// stoneGroup / pass) — NOT the wrong angle/metal/stone keys the monitor used to
// read. A row whose combo lacks these canonical keys collapses into a single
// undefined-keyed bucket (the test/out-gallery-group guard relies on this).
//
// PURE module: no Prisma, no React, no @/lib/runpod. Safe to unit-test directly.

export type GroupBy = "metal" | "angle" | "pass" | "variant";

/** The combo coordinate as stored on Job.combo (Json). All optional — a layer
 *  row fed the WRONG keys reads every field as undefined. */
export type LayerCombo = {
  angleKey?: string;
  metalKey?: string;
  pass?: string;
  stoneGroup?: string;
};

/** Minimal shape groupLayers needs from a gallery layer row. */
export type GroupableLayer = {
  id: string;
  pass: string;
  url: string;
  combo: LayerCombo | Record<string, unknown> | null | undefined;
};

/** One grouped bucket. The leading angleKey/metalKey/pass/stoneGroup are the
 *  canonical combo coordinate of the FIRST layer in the bucket — the gallery
 *  uses them for the section header / chips. */
export type LayerGroup<T extends GroupableLayer = GroupableLayer> = {
  key: string;
  groupBy: GroupBy;
  angleKey?: string;
  metalKey?: string;
  pass?: string;
  stoneGroup?: string;
  layers: T[];
};

function comboOf(row: GroupableLayer): LayerCombo {
  const c = row.combo;
  if (c && typeof c === "object") return c as LayerCombo;
  return {};
}

// The bucket discriminator per group mode. Returns a stable string key so two
// rows with the same canonical coordinate land in the same bucket; `undefined`
// fields stringify to the literal "undefined" so wrong-keyed rows collapse.
function bucketKey(combo: LayerCombo, groupBy: GroupBy): string {
  switch (groupBy) {
    case "angle":
      return `angle:${combo.angleKey}`;
    case "pass":
      return `pass:${combo.pass}:${combo.stoneGroup ?? ""}`;
    case "variant":
      // A variant is the full metal×stone identity within an angle's family.
      return `variant:${combo.metalKey}:${combo.stoneGroup ?? combo.pass}`;
    case "metal":
    default:
      // Default Metal grouping keeps the angle distinction so a metal section
      // shows its angles; the canonical guard test asserts metalKey+angleKey
      // produce one bucket per (metal, angle).
      return `metal:${combo.metalKey}:${combo.angleKey}`;
  }
}

/**
 * Group gallery layer rows into ordered buckets by the canonical combo keys.
 * Insertion order is preserved (deterministic for a deterministically-ordered
 * input). Default groupBy is "metal".
 */
export function groupLayers<T extends GroupableLayer>(
  rows: readonly T[],
  groupBy: GroupBy = "metal",
): LayerGroup<T>[] {
  const buckets = new Map<string, LayerGroup<T>>();

  for (const row of rows) {
    const combo = comboOf(row);
    const key = bucketKey(combo, groupBy);
    let group = buckets.get(key);
    if (!group) {
      group = {
        key,
        groupBy,
        angleKey: combo.angleKey,
        metalKey: combo.metalKey,
        pass: combo.pass,
        stoneGroup: combo.stoneGroup,
        layers: [],
      };
      buckets.set(key, group);
    }
    group.layers.push(row);
  }

  return [...buckets.values()];
}
