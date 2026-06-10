// PROD-03 — suggestGroup() token-assist heuristics. Pure, deterministic
// substring match over an object signature; operator Accepts (never auto-applied).
// First rule wins; unmatched → null.
import { describe, expect, it } from "vitest";

import { suggestGroup, classifyObject } from "@/lib/tokens";
import type { InventoryObject, InventoryMaterial } from "@/lib/inventory";

function obj(partial: Partial<InventoryObject> & { signature: string }): InventoryObject {
  return {
    name: partial.name ?? partial.signature,
    type: "MESH",
    materialSlots: partial.materialSlots ?? [],
    maxDimension: partial.maxDimension ?? null,
    signature: partial.signature,
  };
}

function mat(partial: Partial<InventoryMaterial> & { name: string }): InventoryMaterial {
  return {
    name: partial.name,
    baseColor: partial.baseColor ?? null,
    metallic: partial.metallic ?? null,
    roughness: partial.roughness ?? null,
    transmission: partial.transmission ?? null,
    ior: partial.ior ?? null,
  };
}

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

  it("classifies a stone in a metal setting as a stone (stone-first order)", () => {
    // "round_5 metal" matches stone2 ("round_") before alloycolour ("metal").
    expect(suggestGroup("round_5 metal")).toBe("stone2");
  });

  it("routes generic gemstone keywords to diamond", () => {
    expect(suggestGroup("Sapphire_01")).toBe("diamond");
    expect(suggestGroup("gem_03")).toBe("diamond");
  });

  it("routes expanded metal keywords to alloycolour", () => {
    expect(suggestGroup("bezel_top")).toBe("alloycolour");
    expect(suggestGroup("gallery_rail")).toBe("alloycolour");
  });
});

describe("classifyObject", () => {
  it("uses the name-based suggestGroup result when the signature matches", () => {
    expect(classifyObject(obj({ signature: "center_diamond glass" }), [])).toBe("diamond");
    expect(classifyObject(obj({ signature: "band_metal gold" }), [])).toBe("alloycolour");
  });

  it("falls back to diamond when a generic object has a transmissive material", () => {
    const result = classifyObject(
      obj({ name: "Object_01", signature: "object_01 stuff", materialSlots: ["Stuff"] }),
      [mat({ name: "Stuff", transmission: 0.9 })],
    );
    expect(result).toBe("diamond");
  });

  it("falls back to diamond when a generic object has a high-IOR material", () => {
    const result = classifyObject(
      obj({ name: "Object_01", signature: "object_01 stuff", materialSlots: ["Stuff"] }),
      [mat({ name: "Stuff", ior: 1.7 })],
    );
    expect(result).toBe("diamond");
  });

  it("falls back to alloycolour when a generic object has a metallic material", () => {
    const result = classifyObject(
      obj({ name: "Object_01", signature: "object_01 stuff", materialSlots: ["Stuff"] }),
      [mat({ name: "Stuff", metallic: 0.9 })],
    );
    expect(result).toBe("alloycolour");
  });

  it("returns null when neither name nor BSDF properties resolve a group", () => {
    const result = classifyObject(
      obj({ name: "Object_01", signature: "object_01 stuff", materialSlots: ["Stuff"] }),
      [mat({ name: "Stuff", metallic: 0.1, transmission: 0.0, ior: 1.45 })],
    );
    expect(result).toBeNull();
  });
});
