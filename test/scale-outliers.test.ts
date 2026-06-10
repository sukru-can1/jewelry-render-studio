// detectScaleOutliers() — median-ratio gross-outlier detection. Pure logic,
// no DB/mocks. Flags the "one giant object" case that mis-frames renders.
import { describe, expect, it } from "vitest";

import { detectScaleOutliers } from "@/lib/inspection/scale";
import type { InventoryObject } from "@/lib/inventory";

function obj(name: string, maxDimension: number | null): InventoryObject {
  return {
    name,
    type: "MESH",
    materialSlots: [],
    maxDimension,
    signature: name.toLowerCase(),
  };
}

describe("detectScaleOutliers", () => {
  it("flags a single giant object (~50× the median)", () => {
    const objects = [
      obj("a", 1),
      obj("b", 1),
      obj("c", 1),
      obj("d", 1),
      obj("giant", 50),
    ];
    const outliers = detectScaleOutliers(objects);
    expect(outliers).toHaveLength(1);
    expect(outliers[0]!.name).toBe("giant");
    expect(outliers[0]!.maxDimension).toBe(50);
    expect(outliers[0]!.ratio).toBe(50);
  });

  it("flags nothing when dimensions are uniform", () => {
    const objects = [obj("a", 1), obj("b", 1), obj("c", 1), obj("d", 1)];
    expect(detectScaleOutliers(objects)).toEqual([]);
  });

  it("returns [] when fewer than 3 objects have dimensions", () => {
    const objects = [obj("a", 1), obj("giant", 100), obj("nodim", null)];
    // only 2 dimensioned objects → not enough signal
    expect(detectScaleOutliers(objects)).toEqual([]);
  });

  it("ignores null-dimension objects but still detects outliers among the rest", () => {
    const objects = [
      obj("a", 2),
      obj("b", 2),
      obj("c", 2),
      obj("nodim", null),
      obj("giant", 40),
    ];
    const outliers = detectScaleOutliers(objects);
    expect(outliers.map((o) => o.name)).toEqual(["giant"]);
    expect(outliers[0]!.ratio).toBe(20);
  });

  it("respects a custom thresholdRatio", () => {
    const objects = [obj("a", 1), obj("b", 1), obj("c", 1), obj("big", 5)];
    // 5× median: below default 8× (no outlier) but above a custom 4× threshold
    expect(detectScaleOutliers(objects)).toEqual([]);
    expect(detectScaleOutliers(objects, 4)).toHaveLength(1);
  });
});
