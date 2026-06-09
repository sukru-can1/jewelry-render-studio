// OUT-02 (RED scaffold) — groupLayers is a pure grouping function that buckets
// Layer+combo rows by the CORRECT combo keys (angleKey/metalKey/stoneGroup — NOT
// angle/metal/stone). RED today: @/lib/gallery/group does not exist (Plan 02/W2).
//
// The guard: a fixture using the WRONG keys (angle/metal/stone) must collapse into
// a single undefined-keyed bucket, proving groupLayers reads the canonical keys.
import { describe, expect, it } from "vitest";

// @ts-expect-error RED scaffold: @/lib/gallery/group is created in Plan 02/W2.
import { groupLayers } from "@/lib/gallery/group";

type Row = {
  id: string;
  pass: string;
  url: string;
  combo: Record<string, unknown>;
};

const correctRows: Row[] = [
  {
    id: "l1",
    pass: "metal",
    url: "outputs/a.png",
    combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
  },
  {
    id: "l2",
    pass: "stone",
    url: "outputs/b.png",
    combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" },
  },
  {
    id: "l3",
    pass: "metal",
    url: "outputs/c.png",
    combo: { angleKey: "front", metalKey: "yellow", pass: "metal" },
  },
];

describe("groupLayers (OUT-02)", () => {
  it("groups by metalKey/angleKey using the canonical combo keys", () => {
    const groups = groupLayers(correctRows);
    // hero+white (2 layers), front+yellow (1 layer) => two distinct buckets.
    expect(groups).toHaveLength(2);

    const heroWhite = groups.find(
      (g: { angleKey?: string; metalKey?: string }) =>
        g.angleKey === "hero" && g.metalKey === "white",
    );
    expect(heroWhite).toBeDefined();
    expect(heroWhite!.layers).toHaveLength(2);
  });

  it("collapses when fed the WRONG keys (angle/metal/stone) — proving the canonical-key guard", () => {
    const wrongRows: Row[] = correctRows.map((r) => ({
      ...r,
      combo: {
        angle: r.combo.angleKey,
        metal: r.combo.metalKey,
        stone: r.combo.stoneGroup,
      },
    }));

    const groups = groupLayers(wrongRows);
    // All angleKey/metalKey read undefined -> a single collapsed bucket.
    expect(groups).toHaveLength(1);
    expect(groups[0].angleKey).toBeUndefined();
    expect(groups[0].metalKey).toBeUndefined();
  });
});
