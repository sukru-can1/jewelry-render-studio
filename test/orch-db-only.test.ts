// ORCH-02 — source-text guard (mirrors deny-default.test.ts readFileSync style).
// The batches pages must read job/batch state from the DB ONLY — never import
// lib/runpod or call submitRunPod/getRunPodStatus directly from a page (the
// webhook + reconcile cron own all RunPod I/O).
//
// Wave 3 creates app/(app)/batches/page.tsx and .../batches/[id]/page.tsx. Until
// then this test is GREEN-BY-VACUITY (files absent → skip). Once Wave 3 creates a
// file, it HARD-FAILS if that file imports runpod. So it is the Wave 3 gate.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PAGES = [
  "app/(app)/batches/page.tsx",
  "app/(app)/batches/[id]/page.tsx",
];

const FORBIDDEN = [/@\/lib\/runpod/, /submitRunPod/, /getRunPodStatus/, /\brunpod\b/i];

describe("batches pages are DB-only (ORCH-02 source guard)", () => {
  for (const rel of PAGES) {
    it(`${rel} imports no RunPod I/O (skip-if-absent at Wave 0)`, () => {
      const path = resolve(process.cwd(), rel);
      if (!existsSync(path)) {
        // Green-by-vacuity: the file does not exist yet (Wave 3 creates it).
        expect(true).toBe(true);
        return;
      }
      const source = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
