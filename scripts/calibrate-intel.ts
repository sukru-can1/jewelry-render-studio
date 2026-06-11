// INTEL-06 (Phase 9, 09-04) — the calibration harness (09-AI-SPEC §5.7).
//
// Scores the labelled reference set (calibration/dataset.json) with the REAL
// vision judge and compares against the human labels:
//   - per-dimension within-±1 agreement rate,
//   - hard-flag hit rate on the labelled bad set (a miss = SAFETY REGRESSION,
//     nonzero exit — T-09-15),
//   - delta sign-agreement rate on non-accept cases (the "raise brightness to
//     fix milky" anti-pattern catcher),
//   - the overall judge↔human agreement + the autoCorrectTrusted (≥0.7) verdict.
//
// USAGE
//   npx tsx scripts/calibrate-intel.ts            # cached verdicts ONLY — zero AI calls (CI-safe)
//   npx tsx scripts/calibrate-intel.ts --record   # score uncached cases LIVE via analyzePreview /
//                                                 # analyzeImageDataUrl (burns OpenAI vision tokens;
//                                                 # requires .env.local with the full required env)
//
// Verdicts are cached in calibration/verdicts.cache.json keyed by case id under
// the dataset's promptVersion, so CI NEVER burns vision calls (T-09-16) —
// re-record only when the prompt/schema changes (bump promptVersion in
// dataset.json AND CALIBRATION_PROMPT_VERSION below, then run --record).
//
// All math is PURE and lives in lib/intelligence/calibration.ts (unit-tested in
// test/intelligence/calibration.test.ts with mocked verdicts). This file is I/O
// wiring only. AI/blob/sharp modules are imported DYNAMICALLY inside the
// --record path so the cached-only mode runs without any configured env.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  AGREEMENT_THRESHOLD,
  computeCalibration,
  renderCalibrationMarkdown,
  type CalibrationCase,
  type CalibrationReport,
} from "../lib/intelligence/calibration";
import { visionVerdictSchema, type VisionVerdict } from "../lib/intelligence/verdict";

/**
 * The prompt/schema version the cached verdicts were recorded under. MUST match
 * dataset.json's promptVersion — bump BOTH whenever the vision SYSTEM prompt
 * (lib/intelligence/analyze-preview.ts) or visionVerdictSchema changes, so
 * stale verdicts are ignored and re-recorded.
 */
export const CALIBRATION_PROMPT_VERSION = "v1-2026-06-11";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = resolve(ROOT, "calibration/dataset.json");
const CACHE_PATH = resolve(ROOT, "calibration/verdicts.cache.json");
const REPORT_DIR = resolve(ROOT, ".planning/phases/09-adaptive-render-intelligence");
const REPORT_MD = resolve(REPORT_DIR, "CALIBRATION-REPORT.md");
const REPORT_JSON = resolve(REPORT_DIR, "CALIBRATION-REPORT.json");

// ── Dataset schema (zod-validated so a malformed case never silently skews) ──

const score = z.number().int().min(1).max(5);
const sign = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

const sourceSchema = z.union([
  z.object({ type: z.literal("local"), path: z.string().min(1) }),
  z.object({ type: z.literal("blob"), pathname: z.string().min(1) }),
]);

const labelledCaseSchema = z.object({
  id: z.string().min(1),
  todo: z.literal(false).optional(),
  provisional: z.boolean().optional(),
  source: sourceSchema,
  metal: z.string().min(1),
  stoneGroup: z.string().min(1),
  angle: z.string().min(1),
  pass: z.enum(["full", "metal", "stone"]),
  expectVerdict: z.enum(["accept", "autoCorrect", "escalate"]),
  humanScores: z.object({
    diamondBrilliance: score,
    metalHighlight: score,
    metalBelievability: score,
    exposureTonal: score,
    stoneSymmetry: score,
    contactShadow: score,
    framing: score,
    backgroundHoldout: score,
  }),
  expectGates: z
    .object({
      milky: z.boolean().optional(),
      wrongMetal: z.boolean().optional(),
      brokenHoldout: z.boolean().optional(),
      blownHighlights: z.boolean().optional(),
      emptyOrBroken: z.boolean().optional(),
    })
    .optional(),
  expectDeltaSign: z
    .object({
      worldStrength: sign.optional(),
      exposure: sign.optional(),
      cardDarkness: sign.optional(),
      contactShadow: sign.optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

const todoCaseSchema = z.object({
  id: z.string().min(1),
  todo: z.literal(true),
  coverage: z.string().min(1),
  notes: z.string().optional(),
});

const datasetSchema = z.object({
  note: z.string().optional(),
  version: z.number(),
  promptVersion: z.string().min(1),
  provisional: z.boolean(),
  target: z.string().optional(),
  cases: z.array(z.union([todoCaseSchema, labelledCaseSchema])),
});

export type LabelledCase = z.infer<typeof labelledCaseSchema>;
export type CalibrationDataset = z.infer<typeof datasetSchema>;

const cacheSchema = z.object({
  promptVersion: z.string(),
  verdicts: z.record(
    z.string(),
    z.object({ recordedAt: z.string(), verdict: visionVerdictSchema }),
  ),
});

type VerdictCache = z.infer<typeof cacheSchema>;

// ── Env loading (dependency-free; mirrors test/setup.ts) ────────────────────

function loadEnvFile(file: string): void {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ── Live scoring (DYNAMIC imports — only the --record path touches ai/blob/sharp) ──

async function scoreLive(
  c: LabelledCase,
): Promise<VisionVerdict> {
  const context = {
    metal: c.metal,
    stoneGroup: c.stoneGroup,
    angle: c.angle,
    pass: c.pass,
  };
  const { analyzePreview, analyzeImageDataUrl } = await import(
    "../lib/intelligence/analyze-preview"
  );
  if (c.source.type === "blob") {
    // Private blob pathname — same path the production sweep scores.
    return analyzePreview(c.source.pathname, context);
  }
  // Local file — downscale exactly like preview-image.ts, then grade.
  const sharp = (await import("sharp")).default;
  const raw = readFileSync(resolve(ROOT, c.source.path));
  const png = await sharp(raw)
    .resize({ width: 768, height: 768, fit: "inside" })
    .png()
    .toBuffer();
  return analyzeImageDataUrl(`data:image/png;base64,${png.toString("base64")}`, context);
}

// ── The harness ──────────────────────────────────────────────────────────────

export type RunCalibrationResult = {
  report: CalibrationReport;
  skipped: { id: string; reason: string }[];
  todoCount: number;
  provisional: boolean;
  exitCode: number;
};

export async function runCalibration(
  opts: { record?: boolean } = {},
): Promise<RunCalibrationResult> {
  const record = opts.record === true;
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const dataset = datasetSchema.parse(JSON.parse(readFileSync(DATASET_PATH, "utf8")));
  if (dataset.promptVersion !== CALIBRATION_PROMPT_VERSION) {
    throw new Error(
      `promptVersion mismatch: dataset.json says "${dataset.promptVersion}" but ` +
        `CALIBRATION_PROMPT_VERSION is "${CALIBRATION_PROMPT_VERSION}". Bump BOTH ` +
        `together when the vision prompt/schema changes, then re-run with --record.`,
    );
  }

  let cache: VerdictCache = { promptVersion: CALIBRATION_PROMPT_VERSION, verdicts: {} };
  if (existsSync(CACHE_PATH)) {
    try {
      const parsed = cacheSchema.parse(JSON.parse(readFileSync(CACHE_PATH, "utf8")));
      if (parsed.promptVersion === CALIBRATION_PROMPT_VERSION) {
        cache = parsed;
      } else {
        console.warn(
          `cache promptVersion "${parsed.promptVersion}" is stale (current ` +
            `"${CALIBRATION_PROMPT_VERSION}") — ignoring all cached verdicts.`,
        );
      }
    } catch {
      console.warn("verdicts.cache.json is unreadable/invalid — ignoring it.");
    }
  }

  const labelled = dataset.cases.filter(
    (c): c is LabelledCase => !("todo" in c && c.todo === true),
  );
  const todoCount = dataset.cases.length - labelled.length;

  const scored: { labelled: CalibrationCase; verdict: VisionVerdict }[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let cacheDirty = false;

  for (const c of labelled) {
    const hit = cache.verdicts[c.id];
    let verdict = hit?.verdict;

    if (!verdict && record) {
      if (!process.env.OPENAI_API_KEY) {
        skipped.push({ id: c.id, reason: "--record given but OPENAI_API_KEY is missing" });
        continue;
      }
      if (c.source.type === "local" && !existsSync(resolve(ROOT, c.source.path))) {
        skipped.push({ id: c.id, reason: `local file missing: ${c.source.path}` });
        continue;
      }
      try {
        console.log(`scoring ${c.id} live (${c.source.type})…`);
        verdict = await scoreLive(c);
        cache.verdicts[c.id] = {
          recordedAt: new Date().toISOString(),
          verdict,
        };
        cacheDirty = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skipped.push({ id: c.id, reason: `live scoring failed: ${message}` });
        continue;
      }
    }

    if (!verdict) {
      skipped.push({
        id: c.id,
        reason: "no cached verdict — run `npx tsx scripts/calibrate-intel.ts --record` to score live",
      });
      continue;
    }

    scored.push({ labelled: c, verdict });
  }

  if (cacheDirty) {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
    console.log(`verdict cache updated: ${CACHE_PATH}`);
  }

  const report = computeCalibration(scored);
  const provisional =
    dataset.provisional ||
    scored.some(({ labelled: c }) => (c as LabelledCase & { provisional?: boolean }).provisional === true);

  const meta = {
    generatedAt: new Date().toISOString(),
    promptVersion: CALIBRATION_PROMPT_VERSION,
    provisional,
    skipped,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_MD, renderCalibrationMarkdown(report, meta));
  writeFileSync(REPORT_JSON, JSON.stringify({ ...meta, report }, null, 2) + "\n");

  // ── Console summary ──
  const pct = (r: number | null) => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
  console.log("");
  console.log("Calibration (INTEL-06, 09-AI-SPEC §5.7)");
  console.log(`  scored: ${report.scoredCases}  skipped: ${skipped.length}  todo slots: ${todoCount}`);
  console.log(`  per-dimension within-±1 rates:`);
  for (const [dim, b] of Object.entries(report.perDimension)) {
    console.log(`    ${dim.padEnd(20)} ${pct(b.rate)}`);
  }
  console.log(`  hard-gate hit rate (bad set): ${pct(report.hardGates.rate)}`);
  console.log(`  delta sign-agreement:         ${pct(report.deltaSigns.rate)}`);
  console.log(
    `  judge<->human agreement:      ${report.scoredCases > 0 ? report.agreement.toFixed(3) : "n/a"}`,
  );
  console.log(
    `  autoCorrectTrusted (>=${AGREEMENT_THRESHOLD}):   ${report.trusted ? "YES" : "NO"}${provisional ? "  [PROVISIONAL labels — NON-trust-gating]" : ""}`,
  );
  console.log(
    report.trusted && !provisional
      ? '  -> auto-correct MAY be enabled: set INTEL_AUTOCORRECT_ENABLED="true" (the human act).'
      : "  -> the loop stays in RECOMMEND-ONLY mode (verdicts + deltas surfaced; operator applies/declines).",
  );
  if (report.hardGates.failures.length > 0) {
    console.error("");
    console.error("SAFETY REGRESSION — expected hard gates did NOT fire:");
    for (const f of report.hardGates.failures) {
      console.error(`  ${f.caseId}: ${f.gate}`);
    }
  }
  console.log("");
  console.log(`report: ${REPORT_MD}`);

  return {
    report,
    skipped,
    todoCount,
    provisional,
    exitCode: report.hardGates.failures.length > 0 ? 1 : 0,
  };
}

// Run when executed directly (npx tsx scripts/calibrate-intel.ts [--record]);
// importing this module (test/intelligence/run-eval.ts) does NOT trigger it.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (invokedDirectly) {
  runCalibration({ record: process.argv.includes("--record") })
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
