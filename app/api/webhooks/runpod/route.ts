import { timingSafeEqual } from "node:crypto";

// SEC-04: RunPod webhook shared-secret scaffold. This endpoint is reachable
// without a user session (machine-to-machine), so it is allowlisted in
// middleware (Task 2) and MUST authenticate itself here via a shared secret
// compared in constant time. Node runtime — `node:crypto` is not edge-safe.
export const runtime = "nodejs";

// Constant-time, length-guarded compare. `timingSafeEqual` throws on unequal
// buffer lengths, so the length check both prevents that throw and avoids
// leaking length via early return timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const provided = req.headers.get("x-webhook-secret") ?? "";
  const expected = process.env.RUNPOD_WEBHOOK_SECRET;

  if (!expected || !secretMatches(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // TODO (Phase 4): reconcile RunPod job status from the webhook payload.
  // Phase 1 only closes the auth gap so this endpoint never ships unauthenticated.
  return Response.json({ ok: true });
}
