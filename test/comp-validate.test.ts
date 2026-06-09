// COMP-02 — validateVariant is a PURE gate over plain numbers (no sharp, no I/O).
// It returns FlattenWarning[] (empty = PASS). It must WARN, never silently flatten:
//   - missing-base    : base undefined (hard-block)
//   - dimension-mismatch: an overlay w/h != base w/h (hard-block)
//   - empty-layer      : overlay alphaMax === 0 OR alphaMean < minAlphaMean (block)
//   - no-overlays      : overlays.length === 0 (advisory)
import { describe, expect, it } from "vitest";

import { validateVariant } from "@/lib/compositing/validate";

const baseDim = { width: 1920, height: 1920 };

function goodOverlay(stoneGroup = "diamond") {
  return { stoneGroup, width: 1920, height: 1920, alphaMax: 255, alphaMean: 40 };
}

describe("validateVariant (COMP-02 validation gate — PURE)", () => {
  it("returns [] (PASS) for a base + a healthy overlay", () => {
    const warnings = validateVariant({ base: baseDim, overlays: [goodOverlay()] });
    expect(warnings).toEqual([]);
  });

  it("fires missing-base when base is undefined (hard-block)", () => {
    const warnings = validateVariant({ overlays: [goodOverlay()] });
    expect(warnings.some((w) => w.code === "missing-base")).toBe(true);
  });

  it("fires dimension-mismatch with expected/actual detail", () => {
    const warnings = validateVariant({
      base: baseDim,
      overlays: [{ stoneGroup: "diamond", width: 1024, height: 768, alphaMax: 255, alphaMean: 40 }],
    });
    const w = warnings.find((x) => x.code === "dimension-mismatch");
    expect(w).toBeDefined();
    expect(w?.detail?.expectedWidth).toBe(1920);
    expect(w?.detail?.expectedHeight).toBe(1920);
    expect(w?.detail?.actualWidth).toBe(1024);
    expect(w?.detail?.actualHeight).toBe(768);
    expect(w?.layer?.stoneGroup).toBe("diamond");
  });

  it("fires empty-layer when an overlay alphaMax === 0 (fully transparent)", () => {
    const warnings = validateVariant({
      base: baseDim,
      overlays: [{ stoneGroup: "ghost", width: 1920, height: 1920, alphaMax: 0, alphaMean: 0 }],
    });
    const w = warnings.find((x) => x.code === "empty-layer");
    expect(w).toBeDefined();
    expect(w?.layer?.stoneGroup).toBe("ghost");
    expect(w?.detail?.alphaMax).toBe(0);
  });

  it("fires empty-layer when alphaMean is below minAlphaMean (default 1.0)", () => {
    const warnings = validateVariant({
      base: baseDim,
      overlays: [{ stoneGroup: "faint", width: 1920, height: 1920, alphaMax: 3, alphaMean: 0.4 }],
    });
    expect(warnings.some((w) => w.code === "empty-layer")).toBe(true);
  });

  it("respects a custom minAlphaMean threshold", () => {
    const overlays = [{ stoneGroup: "low", width: 1920, height: 1920, alphaMax: 50, alphaMean: 5 }];
    // mean 5 passes the default 1.0 but fails a strict 10.0 threshold.
    expect(validateVariant({ base: baseDim, overlays })).toEqual([]);
    expect(
      validateVariant({ base: baseDim, overlays, minAlphaMean: 10 }).some(
        (w) => w.code === "empty-layer",
      ),
    ).toBe(true);
  });

  it("fires no-overlays (advisory) when there are zero stone overlays", () => {
    const warnings = validateVariant({ base: baseDim, overlays: [] });
    expect(warnings.some((w) => w.code === "no-overlays")).toBe(true);
  });

  it("can return multiple warnings at once (missing-base + empty-layer)", () => {
    const warnings = validateVariant({
      overlays: [{ stoneGroup: "ghost", width: 1920, height: 1920, alphaMax: 0, alphaMean: 0 }],
    });
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("missing-base");
    expect(codes).toContain("empty-layer");
  });
});
