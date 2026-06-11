import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { sweepAnalyzingJobs } from "@/lib/intelligence/sweep";
import { reconcileJobs, sweepStrandedJobs } from "@/lib/orchestration/reconcile";
import { retryFailedJobs } from "@/lib/orchestration/retry";

// ORCH-02 / ORCH-03 / T-04-01 — Vercel Cron entry for the reconcile fallback +
// auto-retry. Anyone can curl this URL, so only the CRON_SECRET Bearer (sent by
// Vercel Cron in the Authorization header) proves the caller. node:crypto is not
// edge-safe, so the route runs on the nodejs runtime.
export const runtime = "nodejs";

// INTEL-04 (Phase 9): this tick now also runs the ANALYZING sweep, whose
// gpt-5.5-pro vision call takes multi-second to tens of seconds per job. The
// sweep is bounded (3 jobs/tick) and per-job try/caught, but 60s is too tight at
// p95 — so this route gets the same headroom as ai-analyze (maxDuration 300,
// mirrored by a path-specific vercel.json entry that outranks the api glob).
// This is a CRON path, never a user-facing request path (T-09-09).
export const maxDuration = 300;

// Constant-time, length-guarded compare (mirrors the dispatch route exactly):
// timingSafeEqual throws on unequal buffer lengths, so the length check both
// prevents that throw and avoids leaking length via timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization") ?? "";

  if (!cronSecret || !secretMatches(provided, `Bearer ${cronSecret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Order matters: reconcile FIRST so any webhook-missed terminal status (incl.
  // freshly-failed jobs) lands and stranded jobs are released, THEN retry so the
  // now-visible failed-under-cap jobs are re-queued in the same tick, THEN the
  // ANALYZING sweep so a preview completion reconciled THIS tick (which flipped
  // intelState to ANALYZING via the shared webhook writer) is analyzed without
  // waiting for the next tick. The sweep is kill-switch-gated and bounded.
  const { polled } = await reconcileJobs();
  const { releasedStranded } = await sweepStrandedJobs();
  const { requeued } = await retryFailedJobs();
  const { analyzed } = await sweepAnalyzingJobs();

  return NextResponse.json({ polled, releasedStranded, requeued, analyzed });
}
