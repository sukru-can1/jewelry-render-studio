// ORCH-02 — source-text guard (mirrors deny-default.test.ts readFileSync style).
// The batches pages + the freshness status route must read job/batch state from
// the DB ONLY — never import lib/runpod or call submitRunPod/getRunPodStatus/
// cancelRunPod directly (the webhook + reconcile cron own all RunPod I/O).
//
// Wave 3 created app/(app)/batches/page.tsx; Wave 4 (04-06) creates
// .../batches/[id]/page.tsx. Both files now exist, so this is a HARD gate (not
// the Wave 0 skip-if-absent vacuity): a present file that imports RunPod fails.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// DB-only contract surfaces: both batches pages AND the client freshness route.
const DB_ONLY_FILES = [
  "app/(app)/batches/page.tsx",
  "app/(app)/batches/[id]/page.tsx",
  "app/api/batches/[id]/status/route.ts",
  // Phase 5 (OUT-02, T-05-09): the gallery Server Component reads completed-job
  // Layer rows from the DB only — it must never re-fetch terminal jobs from RunPod.
  "app/(app)/batches/[id]/gallery/page.tsx",
  // Phase 6 (COMP-02): the flatten route derives its layer set from completed-job
  // Layer rows in the DB and composites them — it never touches RunPod.
  "app/(app)/batches/[id]/flatten/route.ts",
  // Phase 6 (COMP-01, 06-02): the compositing Server Component reads completed-job
  // Layer rows from the DB and discovers deliverables by blob prefix — never RunPod.
  "app/(app)/batches/[id]/compositing/page.tsx",
  // Phase 9 (INTEL-05, 09-03): the operator intel surface is DB-only end to end —
  // the read projects Job.intel/intelState, the panel renders it, and the
  // Accept/Reject/Override action only CREATES queued rows for the dispatch cron.
  "lib/intelligence/read.ts",
  "lib/intelligence/operator-actions.ts",
  "app/(app)/batches/[id]/intel-panel.tsx",
];

const FORBIDDEN = [
  /@\/lib\/runpod/,
  /submitRunPod/,
  /getRunPodStatus/,
  /cancelRunPod/,
  /\brunpod\b/i,
];

describe("batches pages + status route are DB-only (ORCH-02 source guard)", () => {
  for (const rel of DB_ONLY_FILES) {
    it(`${rel} exists and imports no RunPod I/O (hard gate)`, () => {
      const path = resolve(process.cwd(), rel);
      // Both batches pages and the status route are shipped (04-05 + 04-06) — the
      // file MUST exist now; absence is a regression, not green-by-vacuity.
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
