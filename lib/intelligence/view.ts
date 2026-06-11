// INTEL-05 (Phase 9, 09-03) — the PURE intel view contract + presentational
// helpers shared by three surfaces:
//   - lib/intelligence/read.ts (server, DB-only projection for the batch page),
//   - lib/intelligence/operator-actions.ts (the Accept/Reject/Override action),
//   - app/(app)/batches/[id]/intel-panel.tsx (the "use client" operator panel).
//
// CLIENT-SAFE by construction: every import below is `import type` (erased at
// build), so this module drags NO prisma, NO ai, NO sharp and NO blob client
// into the browser bundle. All functions are pure and unit-tested in
// test/intel-read.test.ts.

import type { ProfileOverrides } from "@/lib/intelligence/knobs";
import type {
  IntelCost,
  IntelOperatorAction,
  JobIntel,
} from "@/lib/intelligence/sweep";
import type { VisionVerdict } from "@/lib/intelligence/verdict";
import type { Combo } from "@/lib/batches/expand";

/**
 * The per-job intel projection the batch detail page feeds to the panel
 * (09-AI-SPEC §7.2: the operator ALWAYS sees scores + reasoning — never silent).
 */
export type JobIntelView = {
  jobId: string;
  intelState: string;
  /** "hero · white · diamond · stone" mono label from the combo coordinate. */
  comboLabel: string;
  iteration: number;
  /** Full verdict trace (one per analyze cycle) — drives the override picker. */
  verdicts: VisionVerdict[];
  /** The most recent verdict (scores/flags/deltas/rationale), if any yet. */
  latestVerdict: VisionVerdict | null;
  /** The loop's reached decision: accept / autoCorrect / freeze-best / escalate. */
  decision: string | null;
  /** The decision's recorded reason string (audit trail). */
  reason: string | null;
  /** WHY it needs a human — present ONLY when intelState is ESCALATED. */
  escalateReason: string | null;
  /** The clamped override sets actually applied, one per correction iteration. */
  appliedOverrides: ProfileOverrides[];
  bestOverrides: ProfileOverrides | null;
  bestScore: number | null;
  guardrailHits: string[];
  cost: IntelCost;
  operatorAction: IntelOperatorAction | null;
  /**
   * INTEL-06 (09-04): true when the autoCorrect deltas were RECOMMENDED but not
   * applied (trust gate closed) — the panel labels them "not applied".
   */
  recommendOnly: boolean;
  /** Auth-gated file-proxy URL of the analyzed preview (T-09-13), if rendered. */
  previewThumbUrl: string | null;
  previewJobId: string | null;
  finalJobId: string | null;
};

/**
 * Tolerant reader of the schemaless Job.intel Json: a null / partial / foreign
 * shape yields safe defaults instead of throwing (the trace is additive by
 * contract — never assume completeness).
 */
export function normalizeIntel(raw: unknown): JobIntel {
  const base = (raw && typeof raw === "object" ? raw : {}) as Partial<JobIntel>;
  return {
    iteration: typeof base.iteration === "number" ? base.iteration : 0,
    verdicts: Array.isArray(base.verdicts) ? base.verdicts : [],
    appliedOverrides: Array.isArray(base.appliedOverrides) ? base.appliedOverrides : [],
    bestScore: typeof base.bestScore === "number" ? base.bestScore : undefined,
    bestOverrides: base.bestOverrides,
    decision: base.decision,
    reason: base.reason,
    guardrailHits: Array.isArray(base.guardrailHits) ? base.guardrailHits : [],
    cost: {
      visionCalls: base.cost?.visionCalls ?? 0,
      previewRenders: base.cost?.previewRenders ?? 0,
      finalRenders: base.cost?.finalRenders ?? 0,
    },
    request: base.request,
    previewJobId: base.previewJobId,
    finalJobId: base.finalJobId,
    operatorAction: base.operatorAction,
    // INTEL-06 (09-04): the recommend-only marker + the never-applied deltas.
    recommendOnly: base.recommendOnly === true ? true : undefined,
    recommendedDeltas: base.recommendedDeltas,
  };
}

/** Parse the persisted combo Json coordinate; null when structurally unusable. */
export function readIntelCombo(raw: unknown): Combo | null {
  if (!raw || typeof raw !== "object") return null;
  const combo = raw as Partial<Combo>;
  if (!combo.angleKey || !combo.metalKey || !combo.pass) return null;
  return combo as Combo;
}

/** "hero · white · diamond · stone" — the monitor's mono combo label shape. */
export function comboLabel(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const c = raw as Record<string, unknown>;
    const parts = [c.angleKey, c.metalKey, c.stoneGroup, c.pass]
      .filter((v) => typeof v === "string" && v.length > 0)
      .map((v) => String(v));
    if (parts.length > 0) return parts.join(" · ");
  }
  return "render";
}

// ── Operator review state machine ───────────────────────────────────────────

/**
 * States where the loop has SETTLED and an operator decision applies. In-flight
 * states (PREVIEW_QUEUED/ANALYZING/ANALYZING_IN_PROGRESS/ADJUSTED) are not
 * reviewable — the loop still owns them.
 */
export const REVIEWABLE_INTEL_STATES = ["ESCALATED", "FINAL_QUEUED", "DONE"] as const;

export function isReviewable(intelState: string): boolean {
  return (REVIEWABLE_INTEL_STATES as readonly string[]).includes(intelState);
}

/**
 * Resolve the override set a given iteration shipped with: iteration 0 is the
 * SEED preview (no overrides, {}); iteration k>=1 maps to appliedOverrides[k-1].
 * Out-of-range / non-integer -> null (the caller rejects, fail-closed).
 */
export function overridesForIteration(
  intel: { appliedOverrides: ProfileOverrides[] },
  iteration: number,
): ProfileOverrides | null {
  if (!Number.isInteger(iteration) || iteration < 0) return null;
  if (iteration === 0) return {};
  return intel.appliedOverrides[iteration - 1] ?? null;
}

/** The valid override-picker options: [0 (seed), 1..appliedOverrides.length]. */
export function overrideIterationOptions(intel: {
  appliedOverrides: ProfileOverrides[];
}): number[] {
  return Array.from({ length: intel.appliedOverrides.length + 1 }, (_, i) => i);
}

// ── Presentational maps (semantic tokens ONLY — no raw palette, NO purple) ──

/** D1–D8 row order + compact labels for the score bars (09-AI-SPEC §5.1). */
export const SCORE_DIMENSIONS: {
  key: keyof VisionVerdict["scores"];
  dim: string;
  label: string;
}[] = [
  { key: "diamondBrilliance", dim: "D1", label: "Brilliance" },
  { key: "metalHighlight", dim: "D2", label: "Highlight" },
  { key: "metalBelievability", dim: "D3", label: "Metal" },
  { key: "exposureTonal", dim: "D4", label: "Exposure" },
  { key: "stoneSymmetry", dim: "D5", label: "Symmetry" },
  { key: "contactShadow", dim: "D6", label: "Shadow" },
  { key: "framing", dim: "D7", label: "Framing" },
  { key: "backgroundHoldout", dim: "D8", label: "Holdout" },
];

export type ScoreTone = "success" | "warning" | "destructive";

/** Color a 1..5 score by floor: >=4 ships, ==3 borderline, <=2 failing. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 4) return "success";
  if (score === 3) return "warning";
  return "destructive";
}

/** Operator-readable labels for the hard-flag booleans. */
export const FLAG_LABELS: Record<keyof VisionVerdict["flags"], string> = {
  milky: "milky",
  wrongMetal: "wrong metal",
  brokenHoldout: "broken holdout",
  blownHighlights: "blown highlights",
  emptyOrBroken: "empty/broken",
};

/** Only the RAISED flags, as operator labels (stable order). */
export function activeFlags(
  flags: VisionVerdict["flags"] | null | undefined,
): string[] {
  if (!flags) return [];
  return (Object.keys(FLAG_LABELS) as (keyof VisionVerdict["flags"])[])
    .filter((key) => flags[key] === true)
    .map((key) => FLAG_LABELS[key]);
}

/** Trim float noise without losing signal: 0.30000000000000004 -> "0.3". */
export function formatKnobNumber(n: number): string {
  return String(parseFloat(n.toFixed(3)));
}

/** Signed mono delta: 0 -> "0", 0.05 -> "+0.05", -1 -> "-1". */
export function formatSignedDelta(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "-"}${formatKnobNumber(Math.abs(n))}`;
}

const DELTA_LABELS: Record<keyof VisionVerdict["adjust"], string> = {
  worldStrengthDelta: "world",
  exposureDelta: "exposure",
  cardDarknessDelta: "cards",
  contactShadowDelta: "shadow",
};

/** The verdict's PROPOSED knob nudges (zeros skipped), signed for mono display. */
export function proposedDeltaEntries(
  adjust: VisionVerdict["adjust"] | null | undefined,
): { label: string; value: string }[] {
  if (!adjust) return [];
  return (Object.keys(DELTA_LABELS) as (keyof VisionVerdict["adjust"])[])
    .filter((key) => typeof adjust[key] === "number" && adjust[key] !== 0)
    .map((key) => ({ label: DELTA_LABELS[key], value: formatSignedDelta(adjust[key]) }));
}

const KNOB_LABELS: Record<keyof ProfileOverrides, string> = {
  worldStrength: "world",
  exposure: "exposure",
  cardDarkness: "cards",
  contactShadowStrength: "shadow",
  cameraPreset: "camera",
};

/** The APPLIED (clamped, absolute) override values for mono display. */
export function appliedOverrideEntries(
  overrides: ProfileOverrides | null | undefined,
): { label: string; value: string }[] {
  if (!overrides) return [];
  const out: { label: string; value: string }[] = [];
  for (const key of Object.keys(KNOB_LABELS) as (keyof ProfileOverrides)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    out.push({
      label: KNOB_LABELS[key],
      value: typeof value === "number" ? formatKnobNumber(value) : String(value),
    });
  }
  return out;
}

/** Calm operator-facing label per loop state. */
const INTEL_STATE_LABEL: Record<string, string> = {
  PREVIEW_QUEUED: "Preview queued",
  ANALYZING: "Analyzing",
  ANALYZING_IN_PROGRESS: "Analyzing",
  ADJUSTED: "Adjusted — re-previewing",
  FINAL_QUEUED: "Final queued",
  DONE: "Done",
  ESCALATED: "Needs human",
};

export function intelStateLabel(intelState: string): string {
  return INTEL_STATE_LABEL[intelState] ?? intelState;
}

/** Outline badge classes per state — semantic tokens only. */
export const INTEL_STATE_BADGE_CLASS: Record<string, string> = {
  ESCALATED: "border-warning/60 text-warning",
  DONE: "border-success/50 text-success",
  FINAL_QUEUED: "border-info/50 text-info",
};

/** Outline badge classes per reached decision — semantic tokens only. */
export const DECISION_BADGE_CLASS: Record<string, string> = {
  accept: "border-success/50 text-success",
  autoCorrect: "border-info/50 text-info",
  "freeze-best": "border-border text-foreground",
  escalate: "border-warning/60 text-warning",
};
