// Phase 9 source-text guards (mirrors test/blob-guard.test.ts + test/orch-db-only.test.ts).
//
// Two architectural invariants of the adaptive loop, enforced statically so a
// regression fails before it can ship:
//
//  T-09-05 (Information Disclosure): the intelligence modules read preview bytes
//  PRIVATELY only — get(...,{access:'private'}) — never a public read and never
//  a URL built against the auth-gated file proxy (which requires a browser
//  session the server-side analyzer does not have).
//
//  G10 / T-09-07 (single-quality-source): the loop emits recipes ONLY via
//  buildEnterpriseRecipe — the sweep contains no hand-built recipe JSON (no
//  material/reflection-card recipe keys).
//
//  T-09-09 (webhook stays fast): the webhook completion path never imports the
//  AI SDK, the analyzer, or sharp — the slow vision call lives exclusively on
//  the cron sweep. The reconcile cron route must wire sweepAnalyzingJobs in.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function src(rel: string): string {
  const path = resolve(process.cwd(), rel);
  expect(existsSync(path), `${rel} must exist`).toBe(true);
  return readFileSync(path, "utf8");
}

const INTEL_MODULES = [
  "lib/intelligence/sweep.ts",
  "lib/intelligence/analyze-preview.ts",
  "lib/intelligence/preview-image.ts",
];

describe("intelligence modules read private blobs only (T-09-05)", () => {
  for (const rel of INTEL_MODULES) {
    it(`${rel} never reads public and never builds a file-proxy URL`, () => {
      const source = src(rel);
      expect(source).not.toMatch(/access:\s*["']public["']/);
      expect(source).not.toMatch(/\/api\/file/);
      expect(source).not.toMatch(/getDownloadUrl|publicUrl/);
    });
  }

  it("preview-image.ts is the private byte reader: get(...,{access:'private'})", () => {
    const source = src("lib/intelligence/preview-image.ts");
    expect(source).toMatch(/access:\s*["']private["']/);
  });
});

describe("the loop emits recipes ONLY via buildEnterpriseRecipe (G10 / T-09-07)", () => {
  it("sweep.ts imports the generator and contains no hand-built recipe keys", () => {
    const source = src("lib/intelligence/sweep.ts");
    // The single legitimate recipe source is imported and called.
    expect(source).toMatch(/@\/lib\/enterprise-recipes/);
    expect(source).toMatch(/buildEnterpriseRecipe\(/);
    // No hand-built recipe JSON: these are generator-internal recipe keys that
    // must never appear in the orchestration layer.
    expect(source).not.toMatch(/material_map/);
    expect(source).not.toMatch(/reflection_cards/);
    expect(source).not.toMatch(/contact_shadows/);
    expect(source).not.toMatch(/material_strategy/);
  });

  it("sweep.ts composes the PURE 09-01 primitives (decideLoop + applyDeltas)", () => {
    const source = src("lib/intelligence/sweep.ts");
    expect(source).toMatch(/decideLoop\(/);
    expect(source).toMatch(/applyDeltas\(/);
  });
});

describe("the webhook path stays fast — no vision call inline (T-09-09)", () => {
  it("webhook.ts never imports the AI SDK, the analyzer, or sharp", () => {
    const source = src("lib/orchestration/webhook.ts");
    expect(source).not.toMatch(/from\s+["']ai["']/);
    expect(source).not.toMatch(/@ai-sdk/);
    expect(source).not.toMatch(/analyze-preview|analyzePreview/);
    expect(source).not.toMatch(/generateObject|generateText/);
    expect(source).not.toMatch(/from\s+["']sharp["']/);
    // The flip it DOES perform is the guarded intelState transition.
    expect(source).toMatch(/intelState/);
    expect(source).toMatch(/ANALYZING/);
  });

  it("the reconcile cron route wires sweepAnalyzingJobs in (the vision call's home)", () => {
    const source = src("app/api/cron/reconcile/route.ts");
    expect(source).toMatch(/sweepAnalyzingJobs/);
    expect(source).toMatch(/@\/lib\/intelligence\/sweep/);
  });
});
