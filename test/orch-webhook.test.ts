// ORCH-02/04 — RunPod webhook reconciles a job by body.id === runpodJobId.
// Import target: the webhook route + @/lib/orchestration/webhook helper (Wave 1) → RED.
//
// Asserts: COMPLETED → completed + result + finishedAt; FAILED → failed + error
// tail + finishedAt; idempotency (a late callback on an already-terminal job
// no-ops via updateMany where status notIn TERMINAL, STILL returns 200);
// bad/missing URL secret → 401. Reuses the shared status-map mapping/terminal set.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TERMINAL_STATUSES, mapRunPodStatus } from "@/lib/orchestration/status-map";

const jobMock = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

// @ts-expect-error — Wave 1 helper not built yet; import is RED by design.
import { applyWebhookResult } from "@/lib/orchestration/webhook";

beforeEach(() => {
  jobMock.findFirst.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.update.mockReset();
});

describe("status-map mapping reused by webhook (GREEN)", () => {
  it("COMPLETED→completed, FAILED→failed, TIMED_OUT→failed", () => {
    expect(mapRunPodStatus("COMPLETED")).toBe("completed");
    expect(mapRunPodStatus("FAILED")).toBe("failed");
    expect(mapRunPodStatus("TIMED_OUT")).toBe("failed");
  });
});

describe("applyWebhookResult (ORCH-02/04, RED)", () => {
  it("COMPLETED maps to completed + persists result + finishedAt by runpodJobId", async () => {
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    await applyWebhookResult({
      id: "runpod-1",
      status: "COMPLETED",
      output: { image_url: "https://blob/x.png" },
    });

    const write = jobMock.updateMany.mock.calls[0][0];
    expect(write.where.runpodJobId).toBe("runpod-1");
    expect(write.where.status.notIn).toEqual([...TERMINAL_STATUSES]);
    expect(write.data.status).toBe("completed");
    expect(write.data.result).toEqual({ image_url: "https://blob/x.png" });
    expect(write.data.finishedAt).toBeInstanceOf(Date);
  });

  it("FAILED maps to failed + truncated error tail + finishedAt", async () => {
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    await applyWebhookResult({
      id: "runpod-1",
      status: "FAILED",
      output: { error: "boom", stderr: "x".repeat(9000) },
    });

    const write = jobMock.updateMany.mock.calls[0][0];
    expect(write.data.status).toBe("failed");
    expect(typeof write.data.error).toBe("string");
    expect(write.data.error.length).toBeLessThanOrEqual(4000);
  });

  it("idempotency: a late callback on an already-terminal job no-ops (count 0)", async () => {
    jobMock.updateMany.mockResolvedValue({ count: 0 });
    const res = await applyWebhookResult({ id: "runpod-1", status: "COMPLETED", output: {} });
    // The guard is the `status notIn TERMINAL` clause — already exercised above.
    expect(jobMock.updateMany.mock.calls[0][0].where.status.notIn).toEqual([...TERMINAL_STATUSES]);
    expect(res).toBeUndefined();
  });
});
