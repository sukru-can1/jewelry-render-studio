// INTEL-06 (Phase 9, 09-04) — the PURE calibration-gate math (09-AI-SPEC §5.7).
//
// The empirical proof that the vision judge agrees with the QA lead BEFORE the
// adaptive loop is allowed to auto-adjust knobs unsupervised:
//   - withinOne:        each D1–D8 dimension must land within ±1 of the human label;
//   - signAgrees:       every non-accept case's proposed knob delta must move in the
//                       operator-labelled DIRECTION (this catches the "raise
//                       brightness to fix milky" anti-pattern — T-09-15);
//   - hard gates:       every expected hard flag (milky/wrongMetal/brokenHoldout/
//                       emptyOrBroken) must fire on the labelled bad set; a missed
//                       expected-TRUE gate is a SAFETY REGRESSION (hardGateFailure);
//   - agreementScore:   the fraction of ALL checks passing across all scored cases;
//   - autoCorrectTrusted: agreement >= 0.7 — below it the loop runs RECOMMEND-ONLY
//                       (decideLoop returns recommendOnly:true; the sweep ships a
//                       classic FINAL and surfaces the deltas to the operator).
//
// PURE module: no prisma, no ai, no sharp, no blob, no fs. The impure harness
// (scripts/calibrate-intel.ts, re-exported for CI by test/intelligence/run-eval.ts)
// does all I/O and feeds (labelled case, model verdict) pairs into computeCalibration.

import type { VisionVerdict } from "@/lib/intelligence/verdict";

/** The eight rubric dimensions, in display order (09-AI-SPEC §5.1). */
export const DIMENSION_KEYS = [
  "diamondBrilliance",
  "metalHighlight",
  "metalBelievability",
  "exposureTonal",
  "stoneSymmetry",
  "contactShadow",
  "framing",
  "backgroundHoldout",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** The hard-flag booleans a labelled case may expect (verdict.flags keys). */
export type GateKey = keyof VisionVerdict["flags"];

/** Knob names as the SENIOR OPERATOR labels them (verdict.adjust minus "Delta"). */
export const DELTA_SIGN_KEYS = [
  "worldStrength",
  "exposure",
  "cardDarkness",
  "contactShadow",
] as const;

export type DeltaSignKey = (typeof DELTA_SIGN_KEYS)[number];

/** Maps the operator's knob label to the verdict's signed delta field. */
export const DELTA_FIELD_BY_SIGN_KEY: Record<
  DeltaSignKey,
  keyof VisionVerdict["adjust"]
> = {
  worldStrength: "worldStrengthDelta",
  exposure: "exposureDelta",
  cardDarkness: "cardDarknessDelta",
  contactShadow: "contactShadowDelta",
};

export type ExpectedSign = -1 | 0 | 1;

/**
 * One labelled reference case (the HUMAN side of the comparison). Image-source
 * fields (local path / blob pathname) live on the dataset file, not here — this
 * module never does I/O.
 */
export type CalibrationCase = {
  id: string;
  expectVerdict: "accept" | "autoCorrect" | "escalate";
  /** QA-lead 1–5 score per dimension. */
  humanScores: Record<DimensionKey, number>;
  /** Expected hard-flag state; omitted gates are unchecked. */
  expectGates?: Partial<Record<GateKey, boolean>>;
  /** Senior-operator expected knob-move DIRECTION; checked on non-accept only. */
  expectDeltaSign?: Partial<Record<DeltaSignKey, ExpectedSign>>;
};

/** One pass/fail check inside a case evaluation. */
export type CaseCheck = {
  kind: "dimension" | "gate" | "deltaSign";
  key: string;
  expected: number | boolean;
  actual: number | boolean;
  pass: boolean;
};

export type CaseResult = {
  id: string;
  checks: CaseCheck[];
  passed: number;
  total: number;
  /** An expected-TRUE hard gate that did NOT fire — a safety regression. */
  hardGateFailure: boolean;
};

/** The judge↔human agreement threshold gating auto-correct (09-AI-SPEC §5.7). */
export const AGREEMENT_THRESHOLD = 0.7;

/** Treat |delta| below this as "no move" when reading its sign. */
export const SIGN_EPSILON = 1e-6;

/** Per-dimension tolerance: the judge must land within ±1 of the human label. */
export function withinOne(judge: number, human: number): boolean {
  return Math.abs(judge - human) <= 1;
}

/** Sign of a proposed delta, with |value| < epsilon reading as 0 ("no move"). */
export function signOf(value: number, epsilon: number = SIGN_EPSILON): ExpectedSign {
  if (Math.abs(value) < epsilon) return 0;
  return value > 0 ? 1 : -1;
}

/**
 * Does the proposed delta move in the operator-labelled direction?
 * expectedSign 0 means "expect ~no move" — any real move disagrees.
 */
export function signAgrees(
  value: number,
  expectedSign: ExpectedSign,
  epsilon: number = SIGN_EPSILON,
): boolean {
  return signOf(value, epsilon) === expectedSign;
}

/**
 * Evaluate ONE labelled case against the judge's verdict:
 *  - 8 dimension checks (withinOne);
 *  - one check per EXPLICITLY expected gate (true must fire, false must stay off);
 *  - one check per expected delta sign — non-accept cases ONLY (an accept case
 *    needs no correction, so proposed-delta direction is not graded there).
 */
export function evaluateCase(
  labelled: CalibrationCase,
  verdict: VisionVerdict,
): CaseResult {
  const checks: CaseCheck[] = [];
  let hardGateFailure = false;

  for (const dim of DIMENSION_KEYS) {
    const human = labelled.humanScores[dim];
    const judge = verdict.scores[dim];
    checks.push({
      kind: "dimension",
      key: dim,
      expected: human,
      actual: judge,
      pass: withinOne(judge, human),
    });
  }

  for (const [gate, expected] of Object.entries(labelled.expectGates ?? {}) as [
    GateKey,
    boolean,
  ][]) {
    const actual = verdict.flags[gate];
    const pass = actual === expected;
    if (expected === true && !pass) hardGateFailure = true;
    checks.push({ kind: "gate", key: gate, expected, actual, pass });
  }

  if (labelled.expectVerdict !== "accept") {
    for (const [knob, expectedSign] of Object.entries(
      labelled.expectDeltaSign ?? {},
    ) as [DeltaSignKey, ExpectedSign][]) {
      const value = verdict.adjust[DELTA_FIELD_BY_SIGN_KEY[knob]];
      checks.push({
        kind: "deltaSign",
        key: knob,
        expected: expectedSign,
        actual: signOf(value),
        pass: signAgrees(value, expectedSign),
      });
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  return { id: labelled.id, checks, passed, total: checks.length, hardGateFailure };
}

/**
 * The judge↔human agreement: the fraction of ALL checks passing across all
 * scored cases (0..1). An empty set is 0 — never trusted on no evidence.
 */
export function agreementScore(results: CaseResult[]): number {
  const total = results.reduce((sum, r) => sum + r.total, 0);
  if (total === 0) return 0;
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  return passed / total;
}

/**
 * THE trust gate (INTEL-06 / T-09-14): auto-correct may auto re-dispatch ONLY
 * when the judge has proven >= threshold agreement with REAL human labels.
 * Below it the loop runs recommend-only.
 */
export function autoCorrectTrusted(
  agreement: number,
  threshold: number = AGREEMENT_THRESHOLD,
): boolean {
  return agreement >= threshold;
}

export type CalibrationReport = {
  scoredCases: number;
  /** Within-±1 agreement per dimension; rate null when nothing was checked. */
  perDimension: Record<
    DimensionKey,
    { checked: number; within: number; rate: number | null }
  >;
  /** Hard-flag hit rate over EXPECTED-TRUE gates (the labelled bad set). */
  hardGates: {
    expected: number;
    fired: number;
    rate: number | null;
    failures: { caseId: string; gate: GateKey }[];
  };
  /** Delta sign-agreement over all non-accept expected signs. */
  deltaSigns: { checked: number; agreed: number; rate: number | null };
  /** Overall judge↔human agreement (all checks). */
  agreement: number;
  /** agreement >= AGREEMENT_THRESHOLD — the auto-correct trust verdict. */
  trusted: boolean;
  cases: CaseResult[];
};

/**
 * Aggregate the full calibration report from (labelled, verdict) pairs:
 * per-dimension within-±1 rates, the hard-gate hit rate on the bad set (with
 * every miss listed), the delta sign-agreement rate, the overall agreement and
 * the autoCorrectTrusted verdict.
 */
export function computeCalibration(
  scored: { labelled: CalibrationCase; verdict: VisionVerdict }[],
): CalibrationReport {
  const results = scored.map(({ labelled, verdict }) => evaluateCase(labelled, verdict));

  const perDimension = Object.fromEntries(
    DIMENSION_KEYS.map((dim) => [dim, { checked: 0, within: 0, rate: null }]),
  ) as CalibrationReport["perDimension"];

  const hardGates: CalibrationReport["hardGates"] = {
    expected: 0,
    fired: 0,
    rate: null,
    failures: [],
  };
  const deltaSigns: CalibrationReport["deltaSigns"] = {
    checked: 0,
    agreed: 0,
    rate: null,
  };

  for (const result of results) {
    for (const check of result.checks) {
      if (check.kind === "dimension") {
        const bucket = perDimension[check.key as DimensionKey];
        bucket.checked += 1;
        if (check.pass) bucket.within += 1;
      } else if (check.kind === "gate") {
        if (check.expected === true) {
          hardGates.expected += 1;
          if (check.pass) hardGates.fired += 1;
          else hardGates.failures.push({ caseId: result.id, gate: check.key as GateKey });
        }
      } else {
        deltaSigns.checked += 1;
        if (check.pass) deltaSigns.agreed += 1;
      }
    }
  }

  for (const dim of DIMENSION_KEYS) {
    const bucket = perDimension[dim];
    bucket.rate = bucket.checked > 0 ? bucket.within / bucket.checked : null;
  }
  hardGates.rate = hardGates.expected > 0 ? hardGates.fired / hardGates.expected : null;
  deltaSigns.rate = deltaSigns.checked > 0 ? deltaSigns.agreed / deltaSigns.checked : null;

  const agreement = agreementScore(results);

  return {
    scoredCases: results.length,
    perDimension,
    hardGates,
    deltaSigns,
    agreement,
    trusted: autoCorrectTrusted(agreement),
    cases: results,
  };
}

// ── Report rendering (pure string building; the harness writes the file) ────

function pct(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`;
}

export type CalibrationReportMeta = {
  generatedAt: string;
  promptVersion: string;
  /** True while ANY scored case carries engineer-provisional labels. */
  provisional: boolean;
  skipped: { id: string; reason: string }[];
};

/**
 * Render the operator-facing markdown report. PROVISIONAL labels make the
 * agreement number explicitly NON-trust-gating: the ≥0.7 gate may only be
 * flipped on QA-lead-reviewed labels (09-AI-SPEC §5.7 — experts label, not
 * engineers).
 */
export function renderCalibrationMarkdown(
  report: CalibrationReport,
  meta: CalibrationReportMeta,
): string {
  const lines: string[] = [
    "# Calibration Report — judge↔human agreement (INTEL-06)",
    "",
    `- Generated: ${meta.generatedAt}`,
    `- Prompt/schema version: \`${meta.promptVersion}\``,
    `- Scored cases: ${report.scoredCases} · Skipped: ${meta.skipped.length}`,
    `- Labels: ${meta.provisional ? "**PROVISIONAL (engineer-assigned — NON-trust-gating)**" : "QA-lead reviewed"}`,
    "",
    "## Verdict",
    "",
    `- **Judge↔human agreement: ${pct(report.agreement === 0 && report.scoredCases === 0 ? null : report.agreement)}**`,
    `- **Auto-correct trusted (≥ ${AGREEMENT_THRESHOLD}): ${report.trusted ? "YES" : "NO"}**`,
    meta.provisional && report.trusted
      ? "- ⚠️ Agreement is computed on PROVISIONAL labels — the loop STAYS recommend-only until the QA lead + senior operator review every label and re-run this harness."
      : report.trusted
        ? "- The operator may now enable auto-correct by setting `INTEL_AUTOCORRECT_ENABLED=true` (the human act that opens the gate)."
        : "- The loop runs in **RECOMMEND-ONLY** mode: verdicts + proposed deltas are persisted and surfaced; the operator applies/declines; no auto re-preview.",
    "",
    "## Per-dimension within-±1 agreement",
    "",
    "| Dimension | Checked | Within ±1 | Rate |",
    "|-----------|---------|-----------|------|",
    ...DIMENSION_KEYS.map((dim) => {
      const b = report.perDimension[dim];
      return `| ${dim} | ${b.checked} | ${b.within} | ${pct(b.rate)} |`;
    }),
    "",
    "## Hard-gate hit rate (the labelled bad set)",
    "",
    `- Expected gates: ${report.hardGates.expected} · Fired: ${report.hardGates.fired} · Rate: ${pct(report.hardGates.rate)}`,
    ...(report.hardGates.failures.length > 0
      ? [
          "",
          "**SAFETY REGRESSION — expected hard gates that did NOT fire:**",
          ...report.hardGates.failures.map((f) => `- ${f.caseId}: \`${f.gate}\``),
        ]
      : ["- All expected hard gates fired."]),
    "",
    "## Delta sign-agreement (non-accept cases)",
    "",
    `- Checked: ${report.deltaSigns.checked} · Agreed: ${report.deltaSigns.agreed} · Rate: ${pct(report.deltaSigns.rate)}`,
    "",
    "## Per-case results",
    "",
    "| Case | Passed | Total | Hard-gate failure |",
    "|------|--------|-------|-------------------|",
    ...report.cases.map(
      (c) => `| ${c.id} | ${c.passed} | ${c.total} | ${c.hardGateFailure ? "**YES**" : "no"} |`,
    ),
    ...(meta.skipped.length > 0
      ? [
          "",
          "## Skipped cases",
          "",
          ...meta.skipped.map((s) => `- ${s.id}: ${s.reason}`),
        ]
      : []),
    "",
  ];
  return lines.join("\n");
}
