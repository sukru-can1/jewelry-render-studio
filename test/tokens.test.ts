// PROD-03 — suggestGroup() token-assist heuristics. Pure, deterministic
// substring match over an object signature; operator Accepts (never auto-applied).
// First rule wins; unmatched → null.
import { describe, expect, it } from "vitest";

import { suggestGroup } from "@/lib/tokens";

describe("suggestGroup", () => {
  it("maps metal/band signatures to alloycolour", () => {
    expect(suggestGroup("band_metal gold")).toBe("alloycolour");
    expect(suggestGroup("prong_left")).toBe("alloycolour");
    expect(suggestGroup("shank alloy")).toBe("alloycolour");
  });

  it("maps center/diamond signatures to diamond", () => {
    expect(suggestGroup("center_diamond")).toBe("diamond");
    expect(suggestGroup("solitaire main")).toBe("diamond");
  });

  it("maps side/halo signatures to stone2", () => {
    expect(suggestGroup("round_5 side")).toBe("stone2");
    expect(suggestGroup("halo stone2")).toBe("stone2");
  });

  it("maps accent/pave signatures to stone3", () => {
    expect(suggestGroup("pave accent")).toBe("stone3");
    expect(suggestGroup("melee stone3")).toBe("stone3");
  });

  it("is case-insensitive", () => {
    expect(suggestGroup("BAND_METAL Gold")).toBe("alloycolour");
  });

  it("returns null for an unmatched signature", () => {
    expect(suggestGroup("unrelated")).toBeNull();
    expect(suggestGroup("")).toBeNull();
  });
});
