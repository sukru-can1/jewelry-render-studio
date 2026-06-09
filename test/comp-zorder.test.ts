// COMP-02 — overlay z-order is deterministic: stone overlays are sorted ascending
// by (sortOrder ?? Infinity, stoneGroup) regardless of input order. base is always
// the metal pass (rendered first / bottom). Stable across shuffled inputs.
//
// PURE module — no mocks, no I/O.
import { describe, expect, it } from "vitest";

import { groupVariantsForCompositing } from "@/lib/compositing/variants";
import type { LayerWithCombo } from "@/lib/compositing/variants";

function stone(
  id: string,
  stoneGroup: string,
  sortOrder?: number,
): LayerWithCombo {
  return {
    id,
    pass: "stone",
    url: `renders/${id}.png`,
    format: "png",
    combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup, sortOrder },
  };
}

const metal: LayerWithCombo = {
  id: "metal",
  pass: "metal",
  url: "renders/metal.png",
  format: "png",
  combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
};

describe("groupVariantsForCompositing z-order (COMP-02)", () => {
  it("sorts overlays by sortOrder ascending when present", () => {
    const rows = [
      metal,
      stone("c", "diamond", 3),
      stone("a", "emerald", 1),
      stone("b", "sapphire", 2),
    ];
    const [variant] = groupVariantsForCompositing(rows);
    expect(variant.overlays.map((o) => o.stoneGroup)).toEqual([
      "emerald",
      "sapphire",
      "diamond",
    ]);
  });

  it("falls back to alphabetical stoneGroup when sortOrder is absent (Infinity)", () => {
    const rows = [
      metal,
      stone("z", "zircon"),
      stone("a", "amethyst"),
      stone("m", "morganite"),
    ];
    const [variant] = groupVariantsForCompositing(rows);
    expect(variant.overlays.map((o) => o.stoneGroup)).toEqual([
      "amethyst",
      "morganite",
      "zircon",
    ]);
  });

  it("orders sortOrder-having overlays before sortOrder-less ones (Infinity sinks last)", () => {
    const rows = [
      metal,
      stone("none", "zzz-no-order"),
      stone("ordered", "diamond", 5),
    ];
    const [variant] = groupVariantsForCompositing(rows);
    expect(variant.overlays.map((o) => o.stoneGroup)).toEqual([
      "diamond",
      "zzz-no-order",
    ]);
  });

  it("is deterministic across shuffled input (same output for any permutation)", () => {
    const base = [
      stone("a", "diamond", 1),
      stone("b", "sapphire", 2),
      stone("c", "emerald", 3),
    ];
    const expected = ["diamond", "sapphire", "emerald"];
    const permutations = [
      [base[0], base[1], base[2]],
      [base[2], base[1], base[0]],
      [base[1], base[0], base[2]],
    ];
    for (const perm of permutations) {
      const [variant] = groupVariantsForCompositing([metal, ...perm]);
      expect(variant.overlays.map((o) => o.stoneGroup)).toEqual(expected);
    }
  });
});
