// BATCH-05 / BATCH-06 — Pure cost/cap estimate model.
//
// SINGLE SOURCE OF TRUTH for the job-count formula, the soft/hard caps, and the
// (placeholder) GPU cost constants. The client computes an advisory estimate here;
// the server (03-02) recomputes against the SAME `countJobs`/`BATCH_LIMITS` so a
// tampered client count can never bypass the cap (T-03-03, BATCH-06).
//
// PURE module: no Prisma, no React, no `@/lib/runpod`, no I/O. Safe to import from
// both a Client Component and a Server Action.

/**
 * Soft/hard batch-size guardrails (BATCH-06, UI-SPEC §Color thresholds, decision D:
 * thresholds live in ONE config, never inlined in a component).
 *  - SOFT_THRESHOLD: above this the UI warns but still allows submission.
 *  - HARD_CAP: above this the server rejects the batch outright.
 */
export const BATCH_LIMITS = {
  SOFT_THRESHOLD: 48,
  HARD_CAP: 200,
} as const;

/**
 * Placeholder GPU pricing/timing constants. Each value is an [ASSUMED] estimate
 * pending real RunPod pricing (RESEARCH A1). Do NOT scatter these literals into
 * components or the server action — import from here so a single edit re-prices
 * every surface consistently.
 */
export const COST_MODEL = {
  // [ASSUMED] RunPod GPU serverless rate, USD per wall-clock minute. Placeholder
  // pending the real per-second RunPod price for the chosen GPU tier (RESEARCH A1).
  gpuRatePerMinuteUsd: 0.02,
  // [ASSUMED] Fixed per-job overhead in seconds (cold-start, model download, scene
  // build) before any sampling occurs. Placeholder pending profiling (RESEARCH A1).
  baseSecondsPerJob: 20,
  // [ASSUMED] Marginal render seconds per 1,000 Cycles samples at the catalog
  // resolution. Placeholder pending benchmark data (RESEARCH A1).
  secondsPerKSample: 9,
} as const;

/**
 * A batch selection reduced to the only fields that affect cost/count. `stoneTypeCount`
 * is intentionally OPTIONAL and is NEVER read by `countJobs` — stone type varies the
 * material per job, it does not add jobs (BATCH-05).
 */
export type Selection = {
  angleCount: number;
  metalCount: number;
  passCount: number;
  samples: number;
  /** Advisory only — present for callers but proven not to multiply the count. */
  stoneTypeCount?: number;
};

export type Estimate = {
  jobs: number;
  minutes: number;
  costUsd: number;
};

export type Zone = "idle" | "safe" | "warn" | "block";

/**
 * jobCount = |angles| × |metals| × |passes|. Stone type does NOT multiply (BATCH-05):
 * a `stoneTypeCount` field on the selection is ignored here by design.
 */
export function countJobs(
  s: Pick<Selection, "angleCount" | "metalCount" | "passCount"> & {
    stoneTypeCount?: number;
  },
): number {
  return s.angleCount * s.metalCount * s.passCount;
}

/**
 * Per-job render seconds for a given sample count. Monotonic in `samples`:
 * base overhead + a linear sampling term.
 */
function secondsPerJob(samples: number): number {
  return COST_MODEL.baseSecondsPerJob + (samples / 1000) * COST_MODEL.secondsPerKSample;
}

/**
 * Advisory cost/time estimate. `minutes` and `costUsd` rise strictly with `samples`
 * (via secondsPerJob) and scale linearly with the job count.
 */
export function estimate(s: Selection): Estimate {
  const jobs = countJobs(s);
  const minutes = (jobs * secondsPerJob(s.samples)) / 60;
  const costUsd = minutes * COST_MODEL.gpuRatePerMinuteUsd;
  return { jobs, minutes, costUsd };
}

/**
 * Map a job count to a guardrail zone (BATCH-06):
 *   jobs <= 0            -> "idle"
 *   0 < jobs <= SOFT     -> "safe"
 *   SOFT < jobs <= HARD  -> "warn"
 *   jobs > HARD          -> "block"
 */
export function zone(jobs: number): Zone {
  if (jobs <= 0) return "idle";
  if (jobs <= BATCH_LIMITS.SOFT_THRESHOLD) return "safe";
  if (jobs <= BATCH_LIMITS.HARD_CAP) return "warn";
  return "block";
}
