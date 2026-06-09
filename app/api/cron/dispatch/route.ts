import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { dispatchQueuedJobs } from "@/lib/orchestration/dispatch";

// ORCH-01 / T-04-01 — Vercel Cron entry for the chunked dispatcher. Anyone can
// curl this URL, so only the CRON_SECRET Bearer (sent by Vercel Cron in the
// Authorization header) proves the caller. node:crypto is not edge-safe.
export const runtime = "nodejs";

// Constant-time, length-guarded compare (mirrors the webhook scaffold's
// secretMatches): timingSafeEqual throws on unequal buffer lengths, so the
// length check both prevents that throw and avoids leaking length via timing.
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

  const result = await dispatchQueuedJobs();
  return NextResponse.json(result);
}
