// INTEL-03 (Phase 9) — decideLoop: the SINGLE place the adaptive loop's decision
// priority and online guardrails live (09-AI-SPEC §5.5 + §6.1). The cron sweep
// (09-02) is pure wiring over this function.
//
// PURE module: imports ONLY knobs.ts + verdict.ts — no prisma/ai/sharp/react.
//
// Decision priority, evaluated EXACTLY in order:
//   escalate -> accept -> autoCorrect -> freeze-best
//
// G10 (single-quality-source) is enforced by TYPES: this module only ever emits
// sanitized VisionVerdict["adjust"] deltas; turning them into a ProfileOverrides
// object goes through knobs.ts applyDeltas, and recipe JSON is built exclusively
// by buildEnterpriseRecipe.
import type { VisionVerdict } from "@/lib/intelligence/verdict";

/** Early-exit gate: overallScore >= GOOD_ENOUGH is "catalog-ready" (research §4). */
export const GOOD_ENOUGH = 4;
/** G3 hard cap on preview->analyze cycles — the GPU-spend upper bound. */
export const MAX_ITERATIONS = 2;

export type LoopDecision = "accept" | "autoCorrect" | "escalate" | "freeze-best";

export type DecideLoopInput = {
  verdict: VisionVerdict;
  /** 0-based count of analyze cycles ALREADY completed before this verdict. */
  iteration: number;
  /**
   * Best overallScore seen on PREVIOUS iterations. Pass 0 on the first analysis
   * (scores are >=1, so the first verdict always counts as an improvement).
   */
  prevBestScore: number;
  /** The job's pass type (Combo.pass). "stone" passes are transparent (G7). */
  pass: "metal" | "stone" | "full";
  /**
   * INTEL-06 calibration trust gate (09-04): decideLoop returns an autoCorrect
   * that may AUTO re-dispatch only when autoCorrectTrusted — i.e. the vision
   * judge has proven >=0.7 agreement with human labels on the reference set
   * (lib/intelligence/calibration.ts) AND a human flipped the flag. DEFAULT
   * false/omitted = RECOMMEND-ONLY: the decision and sanitized deltas are still
   * returned (and persisted as the recommendation) but recommendOnly:true tells
   * the sweep NOT to auto re-preview — the operator applies/declines (09-03).
   * Accept / escalate / freeze-best are unaffected by trust.
   */
  trusted?: boolean;
};

export type DecideLoopResult = {
  decision: LoopDecision;
  reason: string;
  /** Present ONLY on autoCorrect: the G5/G7-sanitized deltas to feed applyDeltas. */
  appliedDeltas?: VisionVerdict["adjust"];
  /**
   * Present ONLY on autoCorrect: true when the trust gate is CLOSED (not yet
   * autoCorrectTrusted) — appliedDeltas are a RECOMMENDATION the sweep persists
   * and surfaces, never auto-applies to a re-render (T-09-14).
   */
  recommendOnly?: boolean;
  /** G3-G7 hits for the Job.intel audit trace (forbidden_move, pass_gate, ...). */
  guardrailHits: string[];
};

/** No quality dimension may sit at the hard-reject anchor (1). */
export function noDimensionEqualsOne(scores: VisionVerdict["scores"]): boolean {
  return Object.values(scores).every((dim) => dim > 1);
}

/** Does the verdict propose any actual knob movement? */
export function hasNonZeroDelta(adjust: VisionVerdict["adjust"]): boolean {
  return Object.values(adjust).some((delta) => delta !== 0);
}

/**
 * G5 forbidden-move + G7 pass-type gate. Returns sanitized deltas + the hits.
 *
 * G5 — the DOMAIN iron law, enforced even if the model regresses:
 *  - milky: a POSITIVE exposureDelta (raising brightness to "fix" milkiness — the
 *    #1 forbidden anti-pattern) is zeroed; a POSITIVE worldStrengthDelta is zeroed
 *    too (milky = ambient already too high; any exposure/world INCREASE is wrong).
 *  - flat metal (metalBelievability<=2 without milky): a POSITIVE
 *    worldStrengthDelta ("brighten" the metal -> causes milkiness) is zeroed.
 * G7 — contact shadows are N/A on transparent stone passes: any non-zero
 *    contactShadowDelta is dropped there.
 */
export function sanitizeDeltas(
  verdict: VisionVerdict,
  pass: DecideLoopInput["pass"],
): { deltas: VisionVerdict["adjust"]; hits: string[] } {
  const deltas = { ...verdict.adjust };
  const hits: string[] = [];

  if (verdict.flags.milky && deltas.exposureDelta > 0) {
    deltas.exposureDelta = 0;
    hits.push("forbidden_move:exposure");
  }

  const flatMetal = verdict.scores.metalBelievability <= 2 && !verdict.flags.milky;
  if ((verdict.flags.milky || flatMetal) && deltas.worldStrengthDelta > 0) {
    deltas.worldStrengthDelta = 0;
    hits.push("forbidden_move:worldStrength");
  }

  if (pass === "stone" && deltas.contactShadowDelta !== 0) {
    deltas.contactShadowDelta = 0;
    hits.push("pass_gate:contactShadow");
  }

  return { deltas, hits };
}

/**
 * The escalate -> accept -> autoCorrect -> freeze-best decision (AI-SPEC §5.5).
 *
 * accept    = D1>=4 && D3>=4 && D2>=3 && D8>=3 && no dimension==1 && overall>=4.
 * escalate  = brokenHoldout || emptyOrBroken (G6 — never loop on structural
 *             failures) || iteration cap exhausted below the bar (G3).
 * autoCorrect = a real proposed delta, under the cap, strictly improving (G4);
 *             deltas are G5/G7-sanitized before they are returned.
 * freeze-best = everything else: proceed to FINAL with the best-scoring override
 *             set seen so far (never a regressed one).
 */
export function decideLoop(input: DecideLoopInput): DecideLoopResult {
  const { verdict, iteration, prevBestScore, pass, trusted } = input;
  const s = verdict.scores;
  const guardrailHits: string[] = [];

  const accept =
    s.diamondBrilliance >= 4 &&
    s.metalBelievability >= 4 &&
    s.metalHighlight >= 3 &&
    s.backgroundHoldout >= 3 &&
    noDimensionEqualsOne(s) &&
    verdict.overallScore >= GOOD_ENOUGH;

  // ── Priority 1: escalate (never silent, never loop) ──
  if (verdict.flags.brokenHoldout || verdict.flags.emptyOrBroken) {
    const cause = verdict.flags.brokenHoldout
      ? "broken holdout — grouping/token issue, not fixable by light knobs"
      : "structurally empty/broken render";
    return {
      decision: "escalate",
      reason: `G6 escalate-not-loop: ${cause}; surfacing to operator without applying deltas.`,
      guardrailHits,
    };
  }
  if (iteration >= MAX_ITERATIONS && !accept) {
    guardrailHits.push("max_iterations");
    return {
      decision: "escalate",
      reason: `G3 cap: ${iteration} iterations exhausted below the accept bar (overall ${verdict.overallScore} < required).`,
      guardrailHits,
    };
  }

  // ── Priority 2: accept (early exit to FINAL with current overrides) ──
  if (accept) {
    return {
      decision: "accept",
      reason: `Catalog-ready: D1=${s.diamondBrilliance}, D3=${s.metalBelievability}, overall ${verdict.overallScore} >= ${GOOD_ENOUGH}.`,
      guardrailHits,
    };
  }

  // ── Priority 3: autoCorrect (apply clamped deltas, re-preview) ──
  const improved = verdict.overallScore > prevBestScore;
  if (hasNonZeroDelta(verdict.adjust) && iteration < MAX_ITERATIONS && improved) {
    const { deltas, hits } = sanitizeDeltas(verdict, pass);
    guardrailHits.push(...hits);
    if (!hasNonZeroDelta(deltas)) {
      // Every proposed move was zeroed by G5/G7 — re-rendering with no-op deltas
      // would burn a GPU preview for an identical image. Freeze best instead.
      return {
        decision: "freeze-best",
        reason:
          "All proposed deltas were zeroed by guardrails (G5/G7); freezing best overrides instead of a no-op re-preview.",
        guardrailHits,
      };
    }
    // INTEL-06: only an autoCorrectTrusted judge may auto re-dispatch; until
    // calibration proves >=0.7 agreement the deltas are a recommendation only.
    const recommendOnly = trusted !== true;
    return {
      decision: "autoCorrect",
      reason: recommendOnly
        ? `Below the bar (overall ${verdict.overallScore}) with corrective deltas at iteration ${iteration}; trust gate closed — recommending, not re-previewing.`
        : `Below the bar (overall ${verdict.overallScore}) with corrective deltas at iteration ${iteration}; re-previewing.`,
      appliedDeltas: deltas,
      recommendOnly,
      guardrailHits,
    };
  }

  // ── Priority 4: freeze-best (proceed to FINAL with the best set seen) ──
  if (!improved) {
    guardrailHits.push("no_improvement");
    return {
      decision: "freeze-best",
      reason: `G4 stop-on-no-improvement: overall ${verdict.overallScore} <= previous best ${prevBestScore}; freezing the best-scoring override set.`,
      guardrailHits,
    };
  }
  return {
    decision: "freeze-best",
    reason: "No corrective deltas proposed below the accept bar; freezing best overrides and proceeding to FINAL.",
    guardrailHits,
  };
}
