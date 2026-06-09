// ORCH-02 — the reconcile cron polls RunPod for non-terminal jobs and sweeps
// stranded jobs. Import target: @/lib/orchestration/reconcile + the cron route
// (Wave 2, NOT yet built) → RED.
//
// Asserts: CRON_SECRET-gated (bad secret → 401); polls getRunPodStatus ONLY for
// non-terminal jobs WITH a runpodJobId, applying the shared mapping; AND the
// stranded sweep (W-1): a non-terminal job with a NULL runpodJobId older than the
// threshold is released back to 'queued' for re-dispatch.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isTerminal } from "@/lib/orchestration/status-map";

const getRunPodStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runpod", () => ({ getRunPodStatus, submitRunPod: vi.fn() }));

const jobMock = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "cron-secret" },
  resolveAppBaseUrl: vi.fn(() => "https://app.example"),
}));

import { reconcileJobs, sweepStrandedJobs } from "@/lib/orchestration/reconcile";

beforeEach(() => {
  getRunPodStatus.mockReset();
  jobMock.findMany.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.update.mockReset();
});

describe("reconcile shares status-map terminal contract (GREEN)", () => {
  it("isTerminal gates which jobs get polled", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("in_queue")).toBe(false);
  });
});

describe("reconcileJobs (ORCH-02, RED)", () => {
  it("polls getRunPodStatus only for non-terminal jobs with a runpodJobId", async () => {
    jobMock.findMany.mockResolvedValue([
      { id: "j1", status: "in_progress", runpodJobId: "rp-1" },
    ]);
    getRunPodStatus.mockResolvedValue({ status: "COMPLETED", output: {} });
    jobMock.updateMany.mockResolvedValue({ count: 1 });

    await reconcileJobs();

    expect(getRunPodStatus).toHaveBeenCalledWith("rp-1");
    // The findMany filter must exclude terminal statuses and null runpodJobId.
    const where = jobMock.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("runpodJobId");
  });
});

describe("sweepStrandedJobs (ORCH-02 / W-1, RED)", () => {
  it("releases a non-terminal NULL-runpodJobId job older than the threshold back to 'queued'", async () => {
    jobMock.updateMany.mockResolvedValue({ count: 1 });

    await sweepStrandedJobs();

    const sweep = jobMock.updateMany.mock.calls[0][0];
    expect(sweep.where.runpodJobId).toBeNull();
    expect(sweep.data.status).toBe("queued");
  });
});
