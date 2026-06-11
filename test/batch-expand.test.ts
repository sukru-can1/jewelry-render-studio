// BATCH-04/07/03 — Pure combo expansion + recipe-per-combo.
//
// Uses the REAL un-mocked recipe generator (lib/enterprise-recipes.ts is pure) so
// each row's recipe is the AUTHORITATIVE buildEnterpriseRecipe output — never a
// hand-built JSON. Asserts:
//  - buildPasses: the `full` beauty pass is ALWAYS emitted FIRST (the primary
//    catalog output — every angle × metal gets one by default; an explicit "full"
//    selection is deduped); metal-only pass present when "metal" selected; one
//    stone pass per stone group BOTH present on the product AND selected;
//    |passes| === the estimate's passCount.
//  - expandCombos: one row per (angle × metal × pass) in deterministic order;
//    row count === |angles|×|metals|×|passes| (BATCH-07).
//  - Each recipe reflects the mapped angle/metal/pass in `enterprise.*`.
//  - Stone TYPE selects the per-pass material (not the count) — red->rose metal map.
//  - Absent stone groups still get a defaulted stoneMaterials entry (Pitfall 4).
import { describe, expect, it } from "vitest";

import { buildPasses, expandCombos } from "@/lib/batches/expand";
import type { EnterpriseGroupTokens } from "@/lib/enterprise-recipes";

describe("buildPasses (BATCH-04 + full-pass-first contract)", () => {
  it("ALWAYS emits the full beauty pass first, even when only layer passes are selected", () => {
    const passes = buildPasses(["diamond"], ["metal"]);
    expect(passes).toEqual([{ pass: "full" }, { pass: "metal" }]);
  });

  it("dedupes an EXPLICIT 'full' selection into the single default full pass", () => {
    const passes = buildPasses(["diamond"], ["full", "metal", "diamond"]);
    expect(passes).toEqual([
      { pass: "full" },
      { pass: "metal" },
      { pass: "stone", stoneGroup: "diamond" },
    ]);
    // Exactly ONE full pass — never two full jobs per angle × metal.
    expect(passes.filter((p) => p.pass === "full")).toHaveLength(1);
  });

  it("appends one stone pass per group BOTH present AND selected, after full+metal", () => {
    const passes = buildPasses(["diamond", "stone2"], ["metal", "diamond", "stone2"]);
    expect(passes).toEqual([
      { pass: "full" },
      { pass: "metal" },
      { pass: "stone", stoneGroup: "diamond" },
      { pass: "stone", stoneGroup: "stone2" },
    ]);
  });

  it("ignores a selected stone group the product does NOT have", () => {
    // stone3 selected but not present on the product -> no stone3 pass.
    const passes = buildPasses(["diamond"], ["metal", "diamond", "stone3"]);
    expect(passes).toEqual([
      { pass: "full" },
      { pass: "metal" },
      { pass: "stone", stoneGroup: "diamond" },
    ]);
  });

  it("omits metal-only when 'metal' is not selected (full + stone passes)", () => {
    const passes = buildPasses(["diamond"], ["diamond"]);
    expect(passes).toEqual([
      { pass: "full" },
      { pass: "stone", stoneGroup: "diamond" },
    ]);
  });

  it("a 'full'-only selection yields exactly the one full pass", () => {
    const passes = buildPasses(["diamond"], ["full"]);
    expect(passes).toEqual([{ pass: "full" }]);
  });
});

describe("expandCombos (BATCH-07/03)", () => {
  const groupTokens: EnterpriseGroupTokens = {
    alloycolour: ["band_metal gold"],
    diamond: ["center_diamond glass"],
    stone2: [],
    stone3: [],
  };

  it("emits exactly |angles|×|metals|×|passes| rows (full pass included)", () => {
    // 2 angles × 2 metals × 4 passes (full + metal + diamond + stone2) = 16.
    const passes = buildPasses(
      ["diamond", "stone2"],
      ["metal", "diamond", "stone2"],
    );
    expect(passes).toHaveLength(4);
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
    expect(rows).toHaveLength(2 * 2 * 4);
  });

  it("every angle × metal combination gets EXACTLY ONE pass:'full' combo by default", () => {
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
    const fullRows = rows.filter((r) => r.combo.pass === "full");
    expect(fullRows.map((r) => [r.combo.angleKey, r.combo.metalKey])).toEqual([
      ["hero", "white"],
      ["hero", "yellow"],
      ["front", "white"],
      ["front", "yellow"],
    ]);
    for (const row of fullRows) {
      // The full combo carries no stoneGroup and its recipe IS the full recipe.
      expect(row.combo.stoneGroup).toBeUndefined();
      const ent = (row.recipe as { enterprise: Record<string, unknown> }).enterprise;
      expect(ent.pass).toBe("full");
    }
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
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const ent = (row.recipe as { enterprise: Record<string, unknown> }).enterprise;
      expect(ent.angle).toBe("hero");
      expect(ent.metal).toBe("rose");
      expect(ent.pass).toBe(row.combo.pass);
    }
    // full first (primary), then metal (no stone group), then the diamond stone pass.
    expect(rows[0].combo).toEqual({ angleKey: "hero", metalKey: "rose", pass: "full" });
    expect(rows[1].combo).toEqual({ angleKey: "hero", metalKey: "rose", pass: "metal" });
    expect(rows[2].combo).toEqual({
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
    // Three rows regardless of stone type (full + metal + one stone pass).
    expect(rows).toHaveLength(3);
    const recipe = rows[2].recipe as { material_map: Array<{ contains: string[]; material: string }> };
    const diamondEntry = recipe.material_map.find((m) =>
      m.contains.includes("center_diamond glass"),
    );
    expect(diamondEntry?.material).toBe("stone_ruby");
  });

  it("deterministic nested order: angle outer, metal middle, pass inner (full leads)", () => {
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
      ["hero", "white", "full"],
      ["hero", "white", "metal"],
      ["hero", "white", "stone"],
      ["hero", "yellow", "full"],
      ["hero", "yellow", "metal"],
      ["hero", "yellow", "stone"],
      ["front", "white", "full"],
      ["front", "white", "metal"],
      ["front", "white", "stone"],
      ["front", "yellow", "full"],
      ["front", "yellow", "metal"],
      ["front", "yellow", "stone"],
    ]);
  });
});
