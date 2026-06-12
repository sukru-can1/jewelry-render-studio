// INTEL-04 (Phase 9) — the ANALYZING cron sweep: the impure half of the adaptive
// loop, shaped like lib/orchestration/reconcile.ts (bounded findMany + per-job
// try/catch so one failure cannot abort the tick) with dispatch.ts's optimistic
// guarded-updateMany claim.
//
// The sweep is PURE WIRING: every decision comes from decideLoop (09-01 loop.ts),
// every override from applyDeltas (knobs.ts), and every recipe from
// buildEnterpriseRecipe — this module contains NO recipe JSON and NO decision
// logic of its own (G10 / T-09-07). Preview and final renders are ORDINARY
// queued Jobs the existing chunked cron dispatcher picks up — no new dispatch
// path.
//
// Idempotency (T-09-06): every intel transition is a guarded updateMany on the
// expected prior intelState. A duplicate sweep tick loses the
// ANALYZING -> ANALYZING_IN_PROGRESS claim (count===0) and skips; a replayed
// terminal write matches zero rows. No double analysis, no double dispatch.
//
// Budget (G8): <=2 vision calls + <=2 preview renders + 1 final per loop,
// tracked cumulatively in Job.intel.cost (carried forward to every re-preview).
// Exceeding a budget freezes the best-scoring override set and ships the FINAL.

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import {
  buildEnterpriseRecipe,
  type EnterpriseGroupTokens,
  type EnterpriseStoneMaterial,
} from "@/lib/enterprise-recipes";
import { analyzePreview } from "@/lib/intelligence/analyze-preview";
import { applyDeltas, type ProfileOverrides } from "@/lib/intelligence/knobs";
import { decideLoop } from "@/lib/intelligence/loop";
import type { VisionVerdict } from "@/lib/intelligence/verdict";
// PURE shared normalizer (no prisma/ai/sharp behind it) — single tolerant reader
// of the schemaless Job.intel Json, shared with the 09-03 operator surface.
import { normalizeIntel } from "@/lib/intelligence/view";
import type { Combo } from "@/lib/batches/expand";

import type { Prisma } from "@prisma/client";

// Bounded per-tick fan-out: the vision call is multi-second to tens of seconds
// (gpt-5.5-pro reasoning latency), so 3 keeps a tick inside the reconcile
// route's 300s budget even at p95.
const SWEEP_LIMIT = 3;

// G8 — the per-loop budget (09-AI-SPEC §6.1): <=2 vision calls, <=2 preview
// renders, 1 final. GPU spend (not token spend) is what these bound.
const MAX_VISION_CALLS = 2;
const MAX_PREVIEW_RENDERS = 2;

/** Sampling/resolution for one render phase of the loop. */
export type IntelQuality = { samples: number; resolution: number };

/**
 * The serializable buildEnterpriseRecipe context persisted on Job.intel at
 * createBatch seed time. The sweep re-dispatches previews/finals by combining
 * this with the job's combo coordinate — it never re-derives product
 * assignments or quality presets (and never hand-builds a recipe, G10).
 */
export type IntelRequest = {
  groupTokens: EnterpriseGroupTokens;
  stoneMaterials: Record<"diamond" | "stone2" | "stone3", EnterpriseStoneMaterial>;
  productName: string;
  preview: IntelQuality;
  final: IntelQuality;
};

/** Cumulative per-loop spend, carried forward across re-previews (G8). */
export type IntelCost = {
  visionCalls: number;
  previewRenders: number;
  finalRenders: number;
};

/**
 * The operator's review decision logged on the trace (09-AI-SPEC §7.2 / INTEL-05
 * — T-09-12: every ship decision is attributed, never silent). Written ONLY by
 * lib/intelligence/operator-actions.ts via a guarded merge.
 */
export type IntelOperatorAction = {
  action: "accept" | "reject" | "override";
  userId: string;
  /** ISO-8601 timestamp of the review. */
  at: string;
  /** For "override": which iteration's override set the operator chose to ship. */
  overrideIteration?: number;
  /** The classic re-queued job created by the decision (audit link), if any. */
  queuedJobId?: string;
};

/** The Job.intel audit trace (09-AI-SPEC §7.1) — the Json column IS the trace. */
export type JobIntel = {
  iteration: number;
  verdicts: VisionVerdict[];
  appliedOverrides: ProfileOverrides[];
  bestScore?: number;
  bestOverrides?: ProfileOverrides;
  decision?: string;
  reason?: string;
  guardrailHits: string[];
  cost: IntelCost;
  request?: IntelRequest;
  previewJobId?: string;
  finalJobId?: string;
  operatorAction?: IntelOperatorAction;
  /**
   * INTEL-06 (09-04): true when an autoCorrect decision was reached while the
   * trust gate was CLOSED (INTEL_AUTOCORRECT_ENABLED !== "true") — the deltas
   * below were RECOMMENDED, NOT APPLIED; a classic FINAL shipped instead.
   */
  recommendOnly?: boolean;
  /** The G5/G7-sanitized deltas the judge recommended (never applied). */
  recommendedDeltas?: VisionVerdict["adjust"];
};

/** The fresh trace createBatch seeds on every intelligence-preview job. */
export function seedIntel(request: IntelRequest): JobIntel {
  return {
    iteration: 0,
    verdicts: [],
    appliedOverrides: [],
    guardrailHits: [],
    cost: { visionCalls: 0, previewRenders: 1, finalRenders: 0 },
    request,
  };
}

export type SweepAnalyzeResult = { analyzed: number };

type ClaimedJob = {
  id: string;
  batchId: string;
  combo: unknown;
  result: unknown;
  intel: unknown;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** The completed preview's PRIVATE pathname (same mapping layers.ts reads). */
function previewPathname(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const out = result as { image_blob?: { pathname?: unknown }; image_key?: unknown };
  return str(out.image_blob?.pathname) ?? str(out.image_key);
}

function readCombo(raw: unknown): Combo | null {
  if (!raw || typeof raw !== "object") return null;
  const combo = raw as Partial<Combo>;
  if (!combo.angleKey || !combo.metalKey || !combo.pass) return null;
  return combo as Combo;
}

/**
 * The single recipe source of the loop (G10): combo coordinate + persisted
 * request context + clamped overrides -> buildEnterpriseRecipe. Empty overrides
 * pass undefined so the no-override path stays byte-identical (09-01 guarantee).
 */
function buildLoopRecipe(
  combo: Combo,
  request: IntelRequest,
  quality: IntelQuality,
  overrides: ProfileOverrides,
): Record<string, unknown> {
  return buildEnterpriseRecipe({
    angle: combo.angleKey,
    metal: combo.metalKey,
    pass: combo.pass,
    stoneGroup: combo.pass === "stone" ? combo.stoneGroup : undefined,
    groupTokens: request.groupTokens,
    stoneMaterials: request.stoneMaterials,
    productName: request.productName,
    resolution: quality.resolution,
    samples: quality.samples,
    profileOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  });
}

/** Guarded terminal write for a claimed job — a duplicate tick matches zero rows. */
async function transition(jobId: string, intelState: string, intel: JobIntel): Promise<void> {
  await prisma.job.updateMany({
    where: { id: jobId, intelState: "ANALYZING_IN_PROGRESS" },
    data: { intelState, intel: intel as unknown as Prisma.InputJsonValue },
  });
}

/** ESCALATED: surfaced to the operator, never silent, never another render (G6). */
async function escalate(jobId: string, intel: JobIntel, reason: string): Promise<void> {
  intel.decision = "escalate";
  intel.reason = reason;
  await transition(jobId, "ESCALATED", intel);
}

/**
 * Queue the full-sample FINAL as an ordinary queued Job carrying the FROZEN
 * best-scoring override set (never a regressed one), then flip this job to
 * FINAL_QUEUED with the finalJobId link.
 */
async function queueFinal(job: ClaimedJob, combo: Combo, intel: JobIntel): Promise<void> {
  const request = intel.request as IntelRequest; // presence checked by the caller
  const overrides = intel.bestOverrides ?? {};
  const recipe = buildLoopRecipe(combo, request, request.final, overrides);

  const created = await prisma.job.create({
    data: {
      batchId: job.batchId,
      status: "queued",
      combo: job.combo as Prisma.InputJsonValue,
      recipe: recipe as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  intel.cost = { ...intel.cost, finalRenders: intel.cost.finalRenders + 1 };
  intel.finalJobId = created.id;
  await transition(job.id, "FINAL_QUEUED", intel);
}

/**
 * Queue the corrected low-sample re-preview (autoCorrect): a new ordinary
 * queued Job at PREVIEW_QUEUED carrying the whole trace forward (iteration+1,
 * previewRenders+1, the new clamped override set appended), then flip this job
 * to ADJUSTED with the previewJobId link.
 */
async function queueAdjustedPreview(
  job: ClaimedJob,
  combo: Combo,
  intel: JobIntel,
  verdict: VisionVerdict,
  sanitizedDeltas: VisionVerdict["adjust"],
): Promise<void> {
  const request = intel.request as IntelRequest;
  const overrides = applyDeltas(intel.bestOverrides ?? {}, {
    adjust: sanitizedDeltas,
    cameraPresetSuggestion: verdict.cameraPresetSuggestion,
  });
  const recipe = buildLoopRecipe(combo, request, request.preview, overrides);

  const carried: JobIntel = {
    ...intel,
    iteration: intel.iteration + 1,
    appliedOverrides: [...intel.appliedOverrides, overrides],
    cost: { ...intel.cost, previewRenders: intel.cost.previewRenders + 1 },
  };

  const created = await prisma.job.create({
    data: {
      batchId: job.batchId,
      status: "queued",
      combo: job.combo as Prisma.InputJsonValue,
      recipe: recipe as Prisma.InputJsonValue,
      intelState: "PREVIEW_QUEUED",
      intel: carried as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  intel.previewJobId = created.id;
  await transition(job.id, "ADJUSTED", intel);
}

/** One claimed job through analyze -> decide -> dispatch/finalize/escalate. */
async function processClaimedJob(job: ClaimedJob): Promise<void> {
  const intel = normalizeIntel(job.intel);
  const combo = readCombo(job.combo);

  if (!combo || !intel.request) {
    await escalate(
      job.id,
      intel,
      "missing combo or request context on the intelligence job — cannot rebuild a recipe",
    );
    return;
  }

  // G8 — never a third vision call: freeze best and ship the FINAL.
  if (intel.cost.visionCalls >= MAX_VISION_CALLS) {
    intel.guardrailHits = [...intel.guardrailHits, "cost_cap"];
    intel.decision = "freeze-best";
    intel.reason = "G8 cost cap: vision-call budget exhausted; freezing best overrides.";
    await queueFinal(job, combo, intel);
    return;
  }

  const pathname = previewPathname(job.result);
  if (!pathname) {
    await escalate(
      job.id,
      intel,
      "completed preview carries no image pathname (structurally broken worker output)",
    );
    return;
  }

  let verdict: VisionVerdict;
  try {
    // Count the attempt BEFORE the call so failed attempts also consume budget
    // (a permanently failing analysis can never retry unboundedly).
    intel.cost = { ...intel.cost, visionCalls: intel.cost.visionCalls + 1 };
    verdict = await analyzePreview(pathname, {
      metal: combo.metalKey,
      stoneGroup: combo.stoneGroup ?? "none",
      angle: combo.angleKey,
      pass: combo.pass,
    });
  } catch (error) {
    // G1: a verdict we cannot trust never drives a render — operator review.
    intel.guardrailHits = [...intel.guardrailHits, "verdict_invalid"];
    const message = error instanceof Error ? error.message : "unknown analysis error";
    await escalate(job.id, intel, `vision analysis failed: ${message}`);
    return;
  }

  const decided = decideLoop({
    verdict,
    iteration: intel.iteration,
    prevBestScore: intel.bestScore ?? -1,
    pass: combo.pass,
    // INTEL-06 trust gate (T-09-14): auto-applying deltas requires the explicit
    // human act of setting INTEL_AUTOCORRECT_ENABLED="true" AFTER the
    // calibration harness proves >=0.7 judge<->human agreement. Default:
    // recommend-only.
    trusted: env.INTEL_AUTOCORRECT_ENABLED === "true",
  });

  // Trace + best-set tracking. currentOverrides = the set that PRODUCED this
  // preview (the last applied set; {} for the seed preview).
  const currentOverrides =
    intel.appliedOverrides[intel.appliedOverrides.length - 1] ?? {};
  if (verdict.overallScore > (intel.bestScore ?? Number.NEGATIVE_INFINITY)) {
    intel.bestScore = verdict.overallScore;
    intel.bestOverrides = currentOverrides;
  }
  intel.verdicts = [...intel.verdicts, verdict];
  intel.guardrailHits = [...intel.guardrailHits, ...decided.guardrailHits];
  intel.decision = decided.decision;
  intel.reason = decided.reason;

  if (decided.decision === "escalate") {
    await transition(job.id, "ESCALATED", intel);
    return;
  }

  if (decided.decision === "autoCorrect" && decided.appliedDeltas) {
    // INTEL-06 recommend-only (the DEFAULT until calibration >=0.7): persist
    // the verdict + the proposed deltas as a RECOMMENDATION, never re-render
    // with them — ship a classic FINAL (frozen best, {} on the seed preview)
    // and let the operator apply/decline via the intel panel (09-03).
    if (decided.recommendOnly) {
      intel.recommendOnly = true;
      intel.recommendedDeltas = decided.appliedDeltas;
      intel.reason = `${decided.reason} Deltas recommended, not applied (INTEL_AUTOCORRECT_ENABLED is not "true").`;
      await queueFinal(job, combo, intel);
      return;
    }
    // G8 — the preview-render budget: a correction past it freezes best instead.
    if (intel.cost.previewRenders >= MAX_PREVIEW_RENDERS) {
      intel.guardrailHits = [...intel.guardrailHits, "cost_cap"];
      intel.decision = "freeze-best";
      intel.reason =
        "G8 cost cap: preview-render budget exhausted; freezing best overrides.";
      await queueFinal(job, combo, intel);
      return;
    }
    await queueAdjustedPreview(job, combo, intel, verdict, decided.appliedDeltas);
    return;
  }

  // accept | freeze-best -> FINAL with the frozen best-scoring set.
  await queueFinal(job, combo, intel);
}

/**
 * Claim and process one bounded chunk of ANALYZING intelligence jobs.
 *
 * G9 kill-switch first: no vision-judge key (Gemini preferred, OpenAI
 * fallback) or ADAPTIVE_INTELLIGENCE_ENABLED="false" makes this a no-op (loop
 * OFF — the classic render path is untouched). The per-batch optimizeWithAi
 * gate rides in the claim's where clause, so a batch that never opted in is
 * never touched.
 */
export async function sweepAnalyzingJobs(): Promise<SweepAnalyzeResult> {
  if (
    !(env.GOOGLE_GENERATIVE_AI_API_KEY || env.OPENAI_API_KEY) ||
    env.ADAPTIVE_INTELLIGENCE_ENABLED === "false"
  ) {
    return { analyzed: 0 };
  }

  const candidates = await prisma.job.findMany({
    where: {
      intelState: "ANALYZING",
      batch: { optimizeWithAi: true, cancelRequestedAt: null },
    },
    take: SWEEP_LIMIT,
    orderBy: { id: "asc" },
  });

  let analyzed = 0;

  for (const job of candidates) {
    try {
      // Optimistic claim (mirrors dispatch.ts queued->submitted): only the tick
      // that flips ANALYZING -> ANALYZING_IN_PROGRESS (count===1) owns the job.
      const claim = await prisma.job.updateMany({
        where: { id: job.id, intelState: "ANALYZING" },
        data: { intelState: "ANALYZING_IN_PROGRESS" },
      });
      if (claim.count !== 1) continue;

      await processClaimedJob(job as ClaimedJob);
      analyzed += 1;
    } catch (error) {
      // One failing job (bad trace, RunPod blip, DB hiccup) must not abort the tick.
      console.error(`intel sweep: processing failed for job ${job.id}`, error);
    }
  }

  return { analyzed };
}
