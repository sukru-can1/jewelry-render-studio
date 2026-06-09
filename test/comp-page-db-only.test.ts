// COMP-01 (T-06-08) — dedicated source-text guard for the compositing page.
// Mirrors the orch-db-only / deny-default readFileSync style. The compositing
// Server Component reads its layer set from completed-job Layer rows in the DB
// (loadBatchGallery) and discovers flattened deliverables by blob prefix — it must
// NEVER import lib/runpod or call submitRunPod/getRunPodStatus/cancelRunPod. The
// webhook + reconcile cron own all RunPod I/O; a compositing surface that polls the
// GPU dispatch client is a regression.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const COMP_PAGE = "app/(app)/batches/[id]/compositing/page.tsx";

const FORBIDDEN = [
  /@\/lib\/runpod/,
  /submitRunPod/,
  /getRunPodStatus/,
  /cancelRunPod/,
  /\brunpod\b/i,
];

describe("compositing page is DB-only (COMP-01 source guard)", () => {
  it(`${COMP_PAGE} exists and imports no RunPod I/O (hard gate)`, () => {
    const path = resolve(process.cwd(), COMP_PAGE);
    // The page ships this wave (06-02) — absence is a regression, not green-by-vacuity.
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    for (const pattern of FORBIDDEN) {
      expect(source).not.toMatch(pattern);
    }
  });

  it(`${COMP_PAGE} runs requireSession first and is force-dynamic Node`, () => {
    const source = readFileSync(resolve(process.cwd(), COMP_PAGE), "utf8");
    expect(source).toMatch(/requireSession/);
    expect(source).toMatch(/export const runtime = "nodejs"/);
    expect(source).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
