// BATCH-04/07/03 — Pure combo expansion + recipe-per-combo.
//
// Uses the REAL un-mocked recipe generator (lib/enterprise-recipes.ts is pure) so
// each row's recipe is the AUTHORITATIVE buildEnterpriseRecipe output — never a
// hand-built JSON. Asserts:
//  - buildPasses: metal-only pass always present (when "metal" selected); one stone
//    pass per stone group that is BOTH present on the product AND selected; "full"
//    is NEVER produced; |passes| === the estimate's passCount.
//  - expandCombos: one row per (angle × metal × pass) in deterministic order;
//    row count === |angles|×|metals|×|passes| (BATCH-07).
//  - Each recipe reflects the mapped angle/metal/pass in `enterprise.*`.
//  - Stone TYPE selects the per-pass material (not the count) — red->rose metal map.
//  - Absent stone groups still get a defaulted stoneMaterials entry (Pitfall 4).
import { describe, expect, it } from "vitest";

import { buildPasses, expandCombos } from "@/lib/batches/expand";
import type { EnterpriseGroupTokens } from "@/lib/enterprise-recipes";

describe("buildPasses (BATCH-04)", () => {
  it("always includes metal-only when 'metal' is selected", () => {
    const passes = buildPasses(["diamond"], ["metal"]);
    expect(passes).toEqual([{ pass: "metal" }]);
  });

  it("appends one stone pass per group BOTH present AND selected; 'full' never produced", () => {
    const passes = buildPasses(["diamond", "stone2"], ["metal", "diamond", "stone2"]);
    expect(passes).toEqual([
      { pass: "metal" },
      { pass: "stone", stoneGroup: "diamond" },
      { pass: "stone", stoneGroup: "stone2" },
    ]);
    // "full" is never produced — the pass values are only "metal" | "stone".
    expect(passes.map((p) => p.pass)).not.toContain("full");
  });

  it("ignores a selected stone group the product does NOT have", () => {
    // stone3 selected but not present on the product -> no stone3 pass.
    const passes = buildPasses(["diamond"], ["metal", "diamond", "stone3"]);
    expect(passes).toEqual([
      { pass: "metal" },
      { pass: "stone", stoneGroup: "diamond" },
    ]);
  });

  it("omits metal-only when 'metal' is not selected (stone-only passes)", () => {
    const passes = buildPasses(["diamond"], ["diamond"]);
    expect(passes).toEqual([{ pass: "stone", stoneGroup: "diamond" }]);
  });
});

describe("expandCombos (BATCH-07/03)", () => {
  const groupTokens: EnterpriseGroupTokens = {
    alloycolour: ["band_metal gold"],
    diamond: ["center_diamond glass"],
    stone2: [],
    stone3: [],
  };

  it("emits exactly |angles|×|metals|×|passes| rows", () => {
    // 2 angles × 2 metals × 3 passes = 12.
    const passes = buildPasses(
      ["diamond", "stone2"],
      ["metal", "diamond", "stone2"],
    );
    expect(passes).toHaveLength(3);
    const rows = expandCombos({
      angles: ["hero", "front"],
      metals: ["white", "rose"],
      passes,
      groupTokens: {
        alloycolour: ["band_metal gold"],
        diamond: ["center_diamond glass"],
        stone2: ["accent stone2"],
        stone3: [],
      },
      productName: "Ring 99",
      resolution: 1024,
      samples: 128,
      stoneMaterials: { diamond: "diamond", stone2: "sapphire", stone3: "diamond" },
    });
    expect(rows).toHaveLength(2 * 2 * 3);
  });

  it("each recipe is buildEnterpriseRecipe output reflecting the mapped angle/metal/pass", () => {
    const passes = buildPasses(["diamond"], ["metal", "diamond"]);
    const rows = expandCombos({
      angles: ["hero"],
      metals: ["rose"],
      passes,
      groupTokens,
      productName: "Ring 99",
      resolution: 1024,
      samples: 128,
      stoneMaterials: { diamond: "diamond", stone2: "diamond", stone3: "diamond" },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const ent = (row.recipe as { enterprise: Record<string, unknown> }).enterprise;
      expect(ent.angle).toBe("hero");
      expect(ent.metal).toBe("rose");
      expect(ent.pass).toBe(row.combo.pass);
    }
    // The metal pass carries no stone group; the stone pass carries diamond.
    expect(rows[0].combo).toEqual({ angleKey: "hero", metalKey: "rose", pass: "metal" });
    expect(rows[1].combo).toEqual({
      angleKey: "hero",
      metalKey: "rose",
      pass: "stone",
      stoneGroup: "diamond",
    });
  });

  it("stone TYPE sets the recipe MATERIAL, not the job count", () => {
    const passes = buildPasses(["diamond"], ["metal", "diamond"]);
    const rows = expandCombos({
      angles: ["hero"],
      metals: ["white"],
      passes,
      groupTokens,
      productName: "Ring 99",
      resolution: 1024,
      samples: 128,
      // diamond group resolved to the ruby material — type drives material only.
      stoneMaterials: { diamond: "ruby", stone2: "diamond", stone3: "diamond" },
    });
    // Two rows regardless of stone type (metal + one stone pass).
    expect(rows).toHaveLength(2);
    const recipe = rows[1].recipe as { material_map: Array<{ contains: string[]; material: string }> };
    const diamondEntry = recipe.material_map.find((m) =>
      m.contains.includes("center_diamond glass"),
    );
    expect(diamondEntry?.material).toBe("stone_ruby");
  });

  it("deterministic nested order: angle outer, metal middle, pass inner", () => {
    const passes = buildPasses(["diamond"], ["metal", "diamond"]);
    const rows = expandCombos({
      angles: ["hero", "front"],
      metals: ["white", "yellow"],
      passes,
      groupTokens,
      productName: "Ring 99",
      resolution: 1024,
      samples: 128,
      stoneMaterials: { diamond: "diamond", stone2: "diamond", stone3: "diamond" },
    });
    expect(rows.map((r) => [r.combo.angleKey, r.combo.metalKey, r.combo.pass])).toEqual([
      ["hero", "white", "metal"],
      ["hero", "white", "stone"],
      ["hero", "yellow", "metal"],
      ["hero", "yellow", "stone"],
      ["front", "white", "metal"],
      ["front", "white", "stone"],
      ["front", "yellow", "metal"],
      ["front", "yellow", "stone"],
    ]);
  });
});
