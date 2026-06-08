// BATCH-01/02/03 — Batch Builder render-data branch coverage.
//
// The builder PAGE is an RSC that reads prisma directly; per the harness style we
// unit-test the pure data-prep that decides the page's branch + selector shape
// (lib/batches/builder-data.ts), not pixels. Asserts:
//  - a not-ready / no-assignment product yields the empty-state branch (isBuildable
//    false) so NO selector data is assembled (the no-assignment guard);
//  - a ready product WITH a saved assignment is buildable;
//  - present stone groups are derived ONLY from groups that have saved tokens (the
//    picker/pass rows render only for groups the product actually has — BATCH-02/04);
//  - the StoneType catalog is filtered to generator-supported types only (BATCH-03 /
//    T-03-11) so the picker can never offer an unmappable type.
import { describe, expect, it } from "vitest";

import {
  isBuildable,
  presentStoneGroups,
  supportedStoneTypes,
} from "@/lib/batches/builder-data";

describe("builder-data — no-assignment / not-ready guard (BATCH-01)", () => {
  it("a ready product WITH a saved assignment is buildable", () => {
    expect(isBuildable("ready", 2)).toBe(true);
  });

  it("a not-ready product is NOT buildable (empty-state branch)", () => {
    expect(isBuildable("needs_groups", 2)).toBe(false);
    expect(isBuildable("needs_inspection", 1)).toBe(false);
    expect(isBuildable("draft", 5)).toBe(false);
  });

  it("a ready product with ZERO assignment rows is NOT buildable", () => {
    expect(isBuildable("ready", 0)).toBe(false);
  });
});

describe("builder-data — present stone groups (BATCH-02/04)", () => {
  it("derives present groups ONLY from groups that carry saved tokens", () => {
    const present = presentStoneGroups({
      alloycolour: ["band_metal gold"],
      diamond: ["center_diamond glass"],
      stone3: ["accent stone3"],
    });
    // diamond + stone3 present; stone2 absent; alloycolour is not a stone group.
    expect(present).toEqual(["diamond", "stone3"]);
  });

  it("treats an empty token list as NOT present", () => {
    const present = presentStoneGroups({
      diamond: ["x"],
      stone2: [],
    });
    expect(present).toEqual(["diamond"]);
  });

  it("a metal-only product has no present stone groups", () => {
    expect(presentStoneGroups({ alloycolour: ["band_metal gold"] })).toEqual([]);
  });
});

describe("builder-data — supported stone-type subset (BATCH-03 / T-03-11)", () => {
  it("keeps only generator-supported StoneType keys", () => {
    const catalog = [
      { key: "diamond", label: "Diamond" },
      { key: "sapphire", label: "Sapphire" },
      { key: "emerald", label: "Emerald" },
      { key: "ruby", label: "Ruby" },
      { key: "cubic_zirconia", label: "Cubic Zirconia" }, // unsupported -> dropped
      { key: "topaz", label: "Topaz" }, // unsupported -> dropped
    ];
    const supported = supportedStoneTypes(catalog).map((s) => s.key);
    expect(supported).toContain("diamond");
    expect(supported).toContain("sapphire");
    expect(supported).toContain("emerald");
    expect(supported).toContain("ruby");
    expect(supported).not.toContain("cubic_zirconia");
    expect(supported).not.toContain("topaz");
  });
});
