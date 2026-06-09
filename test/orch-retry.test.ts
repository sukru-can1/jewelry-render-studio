// ORCH-03 — failed jobs under the attempt cap are re-queued.
// Import target: @/lib/orchestration/retry (Wave 2, NOT yet built) → RED.
//
// Asserts: a failed job with attempt < CAP is re-queued (status→queued, attempt+1,
// runpodJobId→null, error→null); a completed/cancelled job or attempt≥CAP is
// NEVER re-queued.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jobMock = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

// @ts-expect-error — Wave 2 module not built yet; import is RED by design.
import { RETRY_CAP, retryFailedJobs } from "@/lib/orchestration/retry";

beforeEach(() => {
  jobMock.findMany.mockReset();
  jobMock.update.mockReset();
  jobMock.updateMany.mockReset();
});

describe("retryFailedJobs (ORCH-03, RED)", () => {
  it("re-queues a failed job with attempt < CAP (status→queued, attempt+1, runpodJobId→null, error→null)", async () => {
    jobMock.findMany.mockResolvedValue([
      { id: "j1", status: "failed", attempt: 0, runpodJobId: "rp-1", error: "boom" },
    ]);
    jobMock.update.mockResolvedValue({});

    await retryFailedJobs();

    const write = jobMock.update.mock.calls.find((c) => c[0]?.where?.id === "j1");
    expect(write).toBeTruthy();
    expect(write![0].data.status).toBe("queued");
    expect(write![0].data.attempt).toBe(1);
    expect(write![0].data.runpodJobId).toBeNull();
    expect(write![0].data.error).toBeNull();
  });

  it("never re-queues a job at attempt >= CAP", async () => {
    jobMock.findMany.mockResolvedValue([
      { id: "j2", status: "failed", attempt: RETRY_CAP, runpodJobId: "rp-2", error: "boom" },
    ]);

    await retryFailedJobs();

    const requeued = jobMock.update.mock.calls.some((c) => c[0]?.data?.status === "queued");
    expect(requeued).toBe(false);
  });

  it("never re-queues a completed or cancelled job (findMany filters status:'failed')", async () => {
    jobMock.findMany.mockResolvedValue([]);
    await retryFailedJobs();
    const where = jobMock.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("failed");
  });
});
