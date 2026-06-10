// Scale-outlier detector. A real bug we hit: a model with one diamond ~50× the
// size of every other part broke render framing (the camera fit to the giant
// object, mis-framing the actual product). This pure function flags such "one
// giant object" cases so the operator can fix the model's scale before rendering.

import type { InventoryObject } from "@/lib/inventory";

export interface ScaleOutlier {
  name: string;
  maxDimension: number;
  ratio: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Detect objects whose maxDimension is a gross scale outlier vs. the rest of the
 * model. Computes the MEDIAN of all non-null maxDimension values; any object
 * exceeding `median * thresholdRatio` is reported with its ratio (to the median,
 * rounded to 1 decimal).
 *
 * Returns [] when fewer than 3 objects have dimensions (not enough signal to
 * call an outlier) or when nothing exceeds the threshold. Pure: no side effects.
 */
export function detectScaleOutliers(
  objects: InventoryObject[],
  thresholdRatio = 8,
): ScaleOutlier[] {
  const dimensioned = objects.filter(
    (o): o is InventoryObject & { maxDimension: number } => o.maxDimension != null,
  );
  if (dimensioned.length < 3) return [];

  const med = median(dimensioned.map((o) => o.maxDimension));
  if (med <= 0) return [];

  const cutoff = med * thresholdRatio;
  const outliers: ScaleOutlier[] = [];
  for (const o of dimensioned) {
    if (o.maxDimension > cutoff) {
      outliers.push({
        name: o.name,
        maxDimension: o.maxDimension,
        ratio: Math.round((o.maxDimension / med) * 10) / 10,
      });
    }
  }
  return outliers;
}
