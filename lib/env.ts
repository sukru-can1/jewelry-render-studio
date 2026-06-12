import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Typed, fail-fast environment access (SEC-01 / T-1-CONFIG-01).
 *
 * A missing required secret throws at import time via createEnv's zod validation
 * instead of letting the app run degraded. Never read these via process.env
 * directly elsewhere — import `env` so the schema is the single source of truth.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    RUNPOD_API_KEY: z.string().min(1),
    RUNPOD_ENDPOINT_ID: z.string().min(1),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    RUNPOD_WEBHOOK_SECRET: z.string().min(1),
    // Phase 4 ORCH / decision #5: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
    // to the dispatch/reconcile cron routes — required so a missing secret fails fast.
    CRON_SECRET: z.string().min(1),
    // Optional base URL for building the absolute RunPod webhook callback at dispatch.
    // In production VERCEL_PROJECT_PRODUCTION_URL is the documented fallback (A5); if
    // NEITHER resolves to a valid https origin the dispatcher refuses to submit.
    APP_URL: z.string().url().optional(),
    // Optional: only present when bootstrapping the first Admin via the seed.
    SEED_ADMIN_EMAIL: z.string().min(1).optional(),
    SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
    // Optional (AI auto-grouping, additive): a direct OpenAI key + model id. The
    // feature is opt-in — when OPENAI_API_KEY is absent the route returns a clear
    // "AI is not configured" error and the app otherwise builds/runs unchanged.
    OPENAI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    // Optional (vision judge): when present, render-QA vision verdicts use the
    // latest Gemini model instead of OpenAI (user directive: "always ask gemini
    // latest as visual"). AI_VISION_MODEL overrides the hot-swapping
    // "gemini-flash-latest" alias if a pinned id is ever needed.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
    AI_VISION_MODEL: z.string().optional(),
    // Optional (Phase 9, G9 kill-switch): set to the string "false" to disable
    // the adaptive render loop globally — batches render the classic path. The
    // loop is also OFF when OPENAI_API_KEY is absent or the batch did not opt in.
    ADAPTIVE_INTELLIGENCE_ENABLED: z.string().optional(),
    // Optional (Phase 9, INTEL-06 trust gate / T-09-14): auto-applying AI knob
    // deltas to a re-render requires this to be EXACTLY "true". Default absent
    // = RECOMMEND-ONLY: the loop still scores + decides + persists the verdict
    // and proposed deltas, but ships a classic FINAL and surfaces the deltas to
    // the operator. Flipping it on is the HUMAN act after the calibration
    // harness (scripts/calibrate-intel.ts) proves >=0.7 judge<->human agreement
    // on QA-lead-reviewed labels.
    INTEL_AUTOCORRECT_ENABLED: z.string().optional(),
  },
  client: {},
  // Next.js only inlines NEXT_PUBLIC_* at build; server vars are read at runtime.
  experimental__runtimeEnv: {},
});

/**
 * Resolve the absolute base URL for the RunPod webhook callback (A5).
 *
 * Prefers APP_URL; falls back to the Vercel-provided VERCEL_PROJECT_PRODUCTION_URL
 * (host-only, no scheme). Returns a normalized https origin, or null when neither
 * resolves to a valid https URL — callers (04-02 dispatcher) MUST refuse to submit
 * rather than build a broken `https://undefined` webhook URL.
 */
export function resolveAppBaseUrl(): string | null {
  const candidates = [
    env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}
