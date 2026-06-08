// PROD-02 — parseInventory() over an inspect_materials.py JSON fixture.
// Pure logic (no DB, no mocks). Asserts: MESH-only filtering, signature
// computation (matches render_scene.py object_signature), defensive BSDF
// extraction (resolves "Transmission Weight" → transmission), and absent
// sockets → null. Empty objects[] yields an empty list, not a throw.
import { describe, expect, it } from "vitest";

import { parseInventory } from "@/lib/inventory";
import { inventoryFixture } from "./factories";

describe("parseInventory", () => {
  it("filters to MESH objects only (excludes the CAMERA node)", () => {
    const parsed = parseInventory(inventoryFixture());
    const names = parsed.objects.map((o) => o.name);
    expect(names).toEqual(["band_metal", "center_diamond"]);
    expect(names).not.toContain("InspectCamera");
  });

  it("computes the object signature as lowercased '<name> <non-null slots>'", () => {
    const parsed = parseInventory(inventoryFixture());
    const band = parsed.objects.find((o) => o.name === "band_metal");
    // material_slots ["Gold", null] → non-null "Gold" only
    expect(band?.signature).toBe("band_metal gold");

    const diamond = parsed.objects.find((o) => o.name === "center_diamond");
    expect(diamond?.signature).toBe("center_diamond glass");
  });

  it("carries materialSlots (null preserved) and maxDimension from bounds", () => {
    const parsed = parseInventory(inventoryFixture());
    const band = parsed.objects.find((o) => o.name === "band_metal");
    expect(band?.materialSlots).toEqual(["Gold", null]);
    expect(band?.maxDimension).toBe(10);
  });

  it("resolves a 'Transmission Weight' socket to the transmission value (defensive BSDF)", () => {
    const parsed = parseInventory(inventoryFixture());
    const glass = parsed.materials.find((m) => m.name === "Glass");
    expect(glass?.transmission).toBe(1.0);
    expect(glass?.ior).toBe(2.417);
    expect(glass?.metallic).toBe(0.0);
  });

  it("extracts base color, metallic, roughness, transmission, ior — absent → null", () => {
    const parsed = parseInventory(inventoryFixture());
    const gold = parsed.materials.find((m) => m.name === "Gold");
    expect(gold?.baseColor).toEqual([0.8, 0.6, 0.1, 1]);
    expect(gold?.metallic).toBe(1.0);
    expect(gold?.roughness).toBe(0.2);
    expect(gold?.ior).toBe(1.45);
    // Gold has no transmission socket → null (UI renders "—")
    expect(gold?.transmission).toBeNull();
  });

  it("returns an empty objects list (not a throw) when objects[] is empty", () => {
    const parsed = parseInventory({ source: "x", objects: [], materials: [] });
    expect(parsed.objects).toEqual([]);
    expect(parsed.materials).toEqual([]);
  });

  it("does not throw on malformed/absent input", () => {
    expect(() => parseInventory(null)).not.toThrow();
    expect(() => parseInventory({})).not.toThrow();
    expect(parseInventory(undefined).objects).toEqual([]);
  });
});
