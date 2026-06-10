// UI-01 — status-token sweep guard (mirrors orch-db-only.test.ts readFileSync style).
// The batch builder / estimate panel / group assignment surfaces must render every
// semantic status color through the named tokens (warning/info/success), NEVER the
// raw Tailwind palette (amber-/sky-/emerald-NNN). And the stone-group chip class map
// must be defined ONCE in lib/groups/chip.ts, imported by both call sites.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GROUP_CHIP_CLASS } from "@/lib/groups/chip";

const SWEEP_FILES = [
  "app/(app)/products/[id]/batches/new/estimate-panel.tsx",
  "app/(app)/products/[id]/batches/new/batch-builder.tsx",
  "app/(app)/products/[id]/group-assignment.tsx",
];

// Raw status-palette utilities that bypass the semantic tokens.
const RAW_PALETTE = /\b(amber|sky|emerald)-\d{2,3}\b/;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("UI-01 status-token sweep — no raw palette colors survive", () => {
  for (const rel of SWEEP_FILES) {
    it(`${rel} uses semantic tokens, not raw amber-/sky-/emerald- classes`, () => {
      const src = read(rel);
      expect(src).not.toMatch(RAW_PALETTE);
    });
  }
});

describe("UI-01 stone-group chip map is the single shared source of truth", () => {
  it("exposes token-based classes only (no raw palette, no purple)", () => {
    for (const cls of Object.values(GROUP_CHIP_CLASS)) {
      expect(cls).not.toMatch(RAW_PALETTE);
      expect(cls).not.toMatch(/\b(purple|violet|indigo|fuchsia)-/);
    }
    // The inherited color contract: diamond=primary, stone2=info, stone3=warning.
    expect(GROUP_CHIP_CLASS.diamond).toContain("text-primary");
    expect(GROUP_CHIP_CLASS.stone2).toContain("text-info");
    expect(GROUP_CHIP_CLASS.stone3).toContain("text-warning");
  });

  it("both builder + assignment call sites import the shared map", () => {
    const builder = read("app/(app)/products/[id]/batches/new/batch-builder.tsx");
    const assignment = read("app/(app)/products/[id]/group-assignment.tsx");
    expect(builder).toContain("@/lib/groups/chip");
    expect(assignment).toContain("@/lib/groups/chip");
  });
});
