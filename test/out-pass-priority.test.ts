// Full-pass-first display contract — pure helpers in lib/gallery/group.ts.
//
// The `full` beauty pass is the PRIMARY catalog output; metal/stone passes are
// SECONDARY compositing layers. Both the outputs gallery (sortPrimaryFirst feeds
// groupLayers so full leads every section) and the jobs-monitor completed-row
// preview (preferredPreviewLayer picks the thumbnail) derive from these helpers,
// so the preference is proven here once, in one place.
import { describe, expect, it } from "vitest";

import {
  passPriority,
  preferredPreviewLayer,
  sortPrimaryFirst,
} from "@/lib/gallery/group";

describe("passPriority — full < metal < stone < unknown", () => {
  it("ranks the full beauty pass ahead of every compositing layer", () => {
    expect(passPriority("full")).toBeLessThan(passPriority("metal"));
    expect(passPriority("metal")).toBeLessThan(passPriority("stone"));
  });

  it("ranks unknown/missing pass values last", () => {
    expect(passPriority("stone")).toBeLessThan(passPriority("composite"));
    expect(passPriority(undefined)).toBe(passPriority("anything-else"));
    expect(passPriority(null)).toBeGreaterThan(passPriority("stone"));
  });
});

describe("sortPrimaryFirst — gallery ordering", () => {
  const rows = [
    { id: "s1", pass: "stone" },
    { id: "m1", pass: "metal" },
    { id: "f1", pass: "full" },
    { id: "s2", pass: "stone" },
    { id: "f2", pass: "full" },
  ];

  it("puts full passes first, then metal, then stone", () => {
    expect(sortPrimaryFirst(rows).map((r) => r.id)).toEqual([
      "f1",
      "f2",
      "m1",
      "s1",
      "s2",
    ]);
  });

  it("is stable within a pass (same-pass rows keep input order) and does not mutate the input", () => {
    const input = [...rows];
    const sorted = sortPrimaryFirst(input);
    expect(sorted.filter((r) => r.pass === "stone").map((r) => r.id)).toEqual([
      "s1",
      "s2",
    ]);
    // Input untouched (pure helper).
    expect(input.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe("preferredPreviewLayer — monitor/gallery preview pick", () => {
  it("chooses the FULL pass before metal/stone", () => {
    const picked = preferredPreviewLayer([
      { pass: "stone", url: "s.png" },
      { pass: "metal", url: "m.png" },
      { pass: "full", url: "f.png" },
    ]);
    expect(picked?.pass).toBe("full");
  });

  it("a flattened composite outranks even the full pass (it IS the deliverable)", () => {
    const picked = preferredPreviewLayer([
      { pass: "full", url: "f.png", isFlattened: false },
      { pass: "stone", url: "flat.png", isFlattened: true },
    ]);
    expect(picked?.url).toBe("flat.png");
  });

  it("falls back to the first layer when no flattened/full exists", () => {
    const picked = preferredPreviewLayer([
      { pass: "metal", url: "m.png" },
      { pass: "stone", url: "s.png" },
    ]);
    expect(picked?.url).toBe("m.png");
  });

  it("returns null for an empty list", () => {
    expect(preferredPreviewLayer([])).toBeNull();
  });
});
