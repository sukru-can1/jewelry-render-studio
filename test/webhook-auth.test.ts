// SEC-04: RunPod webhook shared-secret. Verifies the handler rejects a missing
// or wrong secret (401) and accepts the correct RUNPOD_WEBHOOK_SECRET (200).
import { beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/runpod/route";

const SECRET = "test-webhook-secret-value";

beforeAll(() => {
  // The handler reads process.env directly; pin a known secret for the test.
  process.env.RUNPOD_WEBHOOK_SECRET = SECRET;
});

function post(headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/webhooks/runpod", {
      method: "POST",
      headers,
    }),
  );
}

describe("RunPod webhook auth (SEC-04)", () => {
  it("returns 401 with no x-webhook-secret header", async () => {
    const res = await post();
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await post({ "x-webhook-secret": "nope" });
    expect(res.status).toBe(401);
  });

  it("returns 401 with a same-length wrong secret (constant-time path)", async () => {
    const res = await post({ "x-webhook-secret": "x".repeat(SECRET.length) });
    expect(res.status).toBe(401);
  });

  it("returns 200 { ok: true } with the correct secret", async () => {
    const res = await post({ "x-webhook-secret": SECRET });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
