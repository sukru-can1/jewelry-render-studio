import { timingSafeEqual } from "node:crypto";

import { applyWebhookResult } from "@/lib/orchestration/webhook";

// ORCH-02/04 / SEC-04 / T-04-03: RunPod webhook receiver. Reachable without a user
// session (machine-to-machine), allowlisted in middleware, and authenticated here
// via a shared secret compared in constant time. RunPod's webhook field is a plain
// URL and cannot send a custom header, so the secret travels in the query string
// (?s=…) — we ALSO keep the legacy x-webhook-secret header path (defense-in-depth).
// node:crypto is not edge-safe → node runtime.
export const runtime = "nodejs";

// Constant-time, length-guarded compare. timingSafeEqual throws on unequal buffer
// lengths, so the length check both prevents that throw and avoids leaking length
// via early-return timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = process.env.RUNPOD_WEBHOOK_SECRET;

  // Accept the secret from the URL query (RunPod) OR the x-webhook-secret header
  // (legacy/defense-in-depth). Either matching the canonical RUNPOD_WEBHOOK_SECRET
  // authenticates; neither → 401.
  const fromUrl = new URL(req.url).searchParams.get("s") ?? "";
  const fromHeader = req.headers.get("x-webhook-secret") ?? "";

  const authed =
    !!expected &&
    (secretMatches(fromUrl, expected) || secretMatches(fromHeader, expected));

  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  // After auth: parse the body and reconcile idempotently. ALWAYS return 200 — a
  // non-200 triggers RunPod's retry storm (Pitfall 3). A malformed body, unknown
  // status, or zero-row (idempotent) update are all 200.
  try {
    const body = (await req.json()) as {
      id?: unknown;
      status?: unknown;
      output?: unknown;
      error?: unknown;
    };
    if (typeof body?.id === "string" && typeof body?.status === "string") {
      await applyWebhookResult({
        id: body.id,
        status: body.status,
        output: body.output,
        error: body.error,
      });
    }
  } catch {
    // Empty/invalid JSON body — still 200 so RunPod does not retry.
  }

  return Response.json({ ok: true });
}
