// ORCH-01 — the dispatch cron claims queued jobs and submits them to RunPod.
// Import target: @/lib/orchestration/dispatch (Wave 1, NOT yet built) → RED.
//
// Asserts: optimistic claim via updateMany where status:'queued' (≤CHUNK),
// submit with recipe + an absolute webhook URL carrying the secret + job_id,
// persist runpodJobId + non-terminal status, skip jobs whose batch is cancelled,
// release a job back to 'queued' on submit error, AND (A5) when no base URL
// resolves, NEVER call submitRunPod and return the just-claimed job to 'queued'.
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitRunPod = vi.hoisted(() => vi.fn());
const getRunPodStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runpod", () => ({ submitRunPod, getRunPodStatus }));

const resolveAppBaseUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({
  resolveAppBaseUrl,
  env: { CRON_SECRET: "cron-secret", RUNPOD_WEBHOOK_SECRET: "wh-secret" },
}));

// Master-scene wiring: dispatch mints a presigned worker GET for the PRIVATE
// studio .blend when the recipe carries master_scene.enabled.
const workerModelUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/blob", () => ({ workerModelUrl }));

const jobMock = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { dispatchQueuedJobs } from "@/lib/orchestration/dispatch";

beforeEach(() => {
  submitRunPod.mockReset();
  getRunPodStatus.mockReset();
  resolveAppBaseUrl.mockReset();
  resolveAppBaseUrl.mockReturnValue("https://app.example");
  workerModelUrl.mockReset();
  workerModelUrl.mockResolvedValue("https://blob.example/presigned");
  jobMock.findMany.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.update.mockReset();
  revalidatePath.mockReset();
});

describe("dispatchQueuedJobs (ORCH-01, RED)", () => {
  function queuedJob(overrides: Record<string, unknown> = {}) {
    return {
      id: "job-1",
      batchId: "batch-1",
      status: "queued",
      recipe: { foo: "bar" },
      runpodJobId: null,
      attempt: 0,
      batch: { id: "batch-1", cancelRequestedAt: null },
      ...overrides,
    };
  }

  it("optimistically claims queued jobs via updateMany where status:'queued'", async () => {
    jobMock.findMany.mockResolvedValue([queuedJob()]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockResolvedValue({ id: "runpod-1" });

    await dispatchQueuedJobs();

    const claim = jobMock.updateMany.mock.calls[0][0];
    expect(claim.where.status).toBe("queued");
  });

  it("submits with recipe + an absolute webhook URL carrying the secret + job_id", async () => {
    jobMock.findMany.mockResolvedValue([queuedJob()]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockResolvedValue({ id: "runpod-1" });

    await dispatchQueuedJobs();

    const input = submitRunPod.mock.calls[0][0] as Record<string, unknown>;
    expect(input.recipe).toEqual({ foo: "bar" });
    expect(input.job_id).toBe("job-1");
    const webhook = String((input as { webhook?: string }).webhook ?? "");
    expect(webhook).toMatch(/^https:\/\/app\.example\//);
    expect(webhook).toContain("wh-secret");
  });

  it("persists runpodJobId + a non-terminal status after submit", async () => {
    jobMock.findMany.mockResolvedValue([queuedJob()]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockResolvedValue({ id: "runpod-1" });

    await dispatchQueuedJobs();

    const persisted = jobMock.update.mock.calls.find(
      (c) => c[0]?.data?.runpodJobId === "runpod-1",
    );
    expect(persisted).toBeTruthy();
    expect(["submitted", "in_queue"]).toContain(persisted![0].data.status);
  });

  it("skips jobs whose batch is cancelled (no submit)", async () => {
    jobMock.findMany.mockResolvedValue([
      queuedJob({ batch: { id: "batch-1", cancelRequestedAt: new Date() } }),
    ]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });

    await dispatchQueuedJobs();
    expect(submitRunPod).not.toHaveBeenCalled();
  });

  it("releases a job back to 'queued' on submit error", async () => {
    jobMock.findMany.mockResolvedValue([queuedJob()]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockRejectedValue(new Error("runpod 500"));

    await dispatchQueuedJobs();

    const released = jobMock.update.mock.calls.find((c) => c[0]?.data?.status === "queued");
    expect(released).toBeTruthy();
  });

  it("master-scene recipe: submits input.master_scene with a freshly presigned studio .blend URL", async () => {
    jobMock.findMany.mockResolvedValue([
      queuedJob({ recipe: { master_scene: { enabled: true }, name: "master_x" } }),
    ]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockResolvedValue({ id: "runpod-1" });

    await dispatchQueuedJobs();

    expect(workerModelUrl).toHaveBeenCalledWith("master-scenes/v203-studio.blend");
    const input = submitRunPod.mock.calls[0][0] as Record<string, unknown>;
    expect(input.master_scene).toEqual({
      url: "https://blob.example/presigned",
      pathname: "master-scenes/v203-studio.blend",
    });
  });

  it("procedural recipe: input.master_scene is ABSENT and no studio URL is minted", async () => {
    jobMock.findMany.mockResolvedValue([queuedJob()]); // recipe: { foo: "bar" }
    jobMock.updateMany.mockResolvedValue({ count: 1 });
    submitRunPod.mockResolvedValue({ id: "runpod-1" });

    await dispatchQueuedJobs();

    expect(workerModelUrl).not.toHaveBeenCalled();
    const input = submitRunPod.mock.calls[0][0] as Record<string, unknown>;
    expect(input.master_scene).toBeUndefined();
  });

  it("A5: when no base URL resolves, never submits and returns the claimed job to 'queued'", async () => {
    resolveAppBaseUrl.mockReturnValue(null);
    jobMock.findMany.mockResolvedValue([queuedJob()]);
    jobMock.updateMany.mockResolvedValue({ count: 1 });

    await dispatchQueuedJobs();

    expect(submitRunPod).not.toHaveBeenCalled();
    const released = jobMock.update.mock.calls.find((c) => c[0]?.data?.status === "queued");
    expect(released).toBeTruthy();
  });
});
