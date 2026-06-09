// COMP-02 — groupVariantsForCompositing buckets Layer+combo rows by the
// compositing variant key (angleKey × metalKey), NOT group.ts's "variant" mode
// (which ignores angle). base = the single pass:"metal" layer; overlays = every
// pass:"stone" layer. A row whose combo lacks angleKey/metalKey collapses into a
// single undefined-keyed bucket (mirrors group.ts's guard).
//
// PURE module — no mocks, no I/O.
import { describe, expect, it } from "vitest";

import { groupVariantsForCompositing } from "@/lib/compositing/variants";
import type { LayerWithCombo } from "@/lib/compositing/variants";

function layer(
  id: string,
  pass: string,
  combo: Record<string, unknown>,
  extra: Partial<LayerWithCombo> = {},
): LayerWithCombo {
  return {
    id,
    pass,
    url: `renders/${id}.png`,
    format: "png",
    combo,
    ...extra,
  };
}

describe("groupVariantsForCompositing (COMP-02 — angle×metal bucketing)", () => {
  it("buckets layers by (angleKey × metalKey)", () => {
    const rows: LayerWithCombo[] = [
      layer("m-hw", "metal", { angleKey: "hero", metalKey: "white", pass: "metal" }),
      layer("s-hw", "stone", { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" }),
      layer("m-hy", "metal", { angleKey: "hero", metalKey: "yellow", pass: "metal" }),
      layer("m-fw", "metal", { angleKey: "front", metalKey: "white", pass: "metal" }),
    ];

    const variants = groupVariantsForCompositing(rows);
    // 3 distinct (angle,metal) keys: hero/white, hero/yellow, front/white.
    expect(variants).toHaveLength(3);
    const keys = variants.map((v) => v.key).sort();
    expect(keys).toEqual(["front:white", "hero:white", "hero:yellow"].sort());
  });

  it("sets base = the metal pass and overlays = the stone passes for a variant", () => {
    const rows: LayerWithCombo[] = [
      layer("m1", "metal", { angleKey: "hero", metalKey: "white", pass: "metal" }),
      layer("s1", "stone", { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" }),
      layer("s2", "stone", { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "sapphire" }),
    ];

    const [variant] = groupVariantsForCompositing(rows);
    expect(variant.angleKey).toBe("hero");
    expect(variant.metalKey).toBe("white");
    expect(variant.base?.pass).toBe("metal");
    expect(variant.base?.url).toBe("renders/m1.png");
    expect(variant.overlays).toHaveLength(2);
    expect(variant.overlays.every((o) => o.pass === "stone")).toBe(true);
  });

  it("leaves base undefined when there is no metal pass (drives missing-base later)", () => {
    const rows: LayerWithCombo[] = [
      layer("s1", "stone", { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" }),
    ];
    const [variant] = groupVariantsForCompositing(rows);
    expect(variant.base).toBeUndefined();
    expect(variant.overlays).toHaveLength(1);
  });

  it("collapses wrong-keyed rows (no angleKey/metalKey) into one undefined bucket (guard)", () => {
    const rows: LayerWithCombo[] = [
      // The monitor's wrong keys — angle/metal/stone instead of angleKey/metalKey.
      layer("w1", "metal", { angle: "hero", metal: "white", pass: "metal" }),
      layer("w2", "stone", { angle: "front", metal: "yellow", pass: "stone" }),
    ];
    const variants = groupVariantsForCompositing(rows);
    expect(variants).toHaveLength(1);
    expect(variants[0].key).toBe("undefined:undefined");
  });

  it("preserves stable insertion order across variants", () => {
    const rows: LayerWithCombo[] = [
      layer("a", "metal", { angleKey: "hero", metalKey: "white", pass: "metal" }),
      layer("b", "metal", { angleKey: "front", metalKey: "white", pass: "metal" }),
      layer("c", "metal", { angleKey: "top", metalKey: "white", pass: "metal" }),
    ];
    const variants = groupVariantsForCompositing(rows);
    expect(variants.map((v) => v.angleKey)).toEqual(["hero", "front", "top"]);
  });
});
