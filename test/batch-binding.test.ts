// BATCH-03/07 — Domain-key -> recipe-key binding layer. Zero mocks (pure module).
// Asserts every map entry, the positional view->angle map + >4-views null path,
// red->rose, all 10 seeded StoneType keys resolving to a supported material, and
// unknown-key rejection.
import { describe, expect, it } from "vitest";

import {
  ANGLE_ORDER,
  METAL_MAP,
  STONE_MATERIAL_MAP,
  isSupportedStoneType,
  resolveMetal,
  resolveStoneMaterial,
  viewKeyToAngle,
} from "@/lib/batches/binding";

const SEEDED_VIEWS = ["view1", "view2", "view3", "view4"];

describe("viewKeyToAngle (positional, BATCH-03)", () => {
  it("ANGLE_ORDER is hero/front/top/profile", () => {
    expect(ANGLE_ORDER).toEqual(["hero", "front", "top", "profile"]);
  });

  it("maps the 4 seeded views positionally", () => {
    expect(viewKeyToAngle("view1", SEEDED_VIEWS)).toBe("hero");
    expect(viewKeyToAngle("view2", SEEDED_VIEWS)).toBe("front");
    expect(viewKeyToAngle("view3", SEEDED_VIEWS)).toBe("top");
    expect(viewKeyToAngle("view4", SEEDED_VIEWS)).toBe("profile");
  });

  it("sorts the view keys before indexing (order-independent input)", () => {
    expect(viewKeyToAngle("view1", ["view4", "view2", "view1", "view3"])).toBe("hero");
  });

  it("a 5th+ view (index >= 4) returns null — curate/skip, never crash", () => {
    const five = ["view1", "view2", "view3", "view4", "view5"];
    expect(viewKeyToAngle("view5", five)).toBeNull();
  });

  it("a key not in the provided set returns null", () => {
    expect(viewKeyToAngle("nope", SEEDED_VIEWS)).toBeNull();
  });
});

describe("METAL_MAP / resolveMetal (BATCH-07)", () => {
  it("white->white, yellow->yellow, red->rose", () => {
    expect(METAL_MAP.white).toBe("white");
    expect(METAL_MAP.yellow).toBe("yellow");
    expect(METAL_MAP.red).toBe("rose");
  });

  it("resolveMetal returns the mapped generator key", () => {
    expect(resolveMetal("red")).toBe("rose");
    expect(resolveMetal("white")).toBe("white");
  });

  it("an unknown metal key returns null", () => {
    expect(resolveMetal("teal")).toBeNull();
  });
});

describe("resolveStoneMaterial (BATCH-07, all 10 seeded keys)", () => {
  const cases: Array<[string, "diamond" | "sapphire" | "emerald" | "ruby"]> = [
    ["diamond", "diamond"],
    ["black_diamond", "diamond"],
    ["moissanite", "diamond"],
    ["ruby", "ruby"],
    ["sapphire", "sapphire"],
    ["pink_sapphire", "sapphire"],
    ["emerald", "emerald"],
    ["amethyst", "sapphire"],
    ["aquamarine", "sapphire"],
    ["morganite", "ruby"],
  ];

  it.each(cases)("%s -> %s", (key, material) => {
    expect(resolveStoneMaterial(key)).toBe(material);
  });

  it("covers ALL 10 seeded keys", () => {
    expect(Object.keys(STONE_MATERIAL_MAP).sort()).toEqual(
      cases.map(([k]) => k).sort(),
    );
  });

  it("an unmapped/unknown key returns null (caller rejects)", () => {
    expect(resolveStoneMaterial("opal")).toBeNull();
    expect(resolveStoneMaterial("")).toBeNull();
  });
});

describe("isSupportedStoneType", () => {
  it("true iff resolveStoneMaterial is non-null", () => {
    expect(isSupportedStoneType("diamond")).toBe(true);
    expect(isSupportedStoneType("morganite")).toBe(true);
    expect(isSupportedStoneType("opal")).toBe(false);
  });
});
