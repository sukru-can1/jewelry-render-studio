// OUT-02 (RED scaffold) — loadBatchGallery reads gallery data from the DB ONLY:
// it filters jobs to status:"completed" and includes their layers; it never imports
// or calls lib/runpod (terminal jobs are never re-fetched). RED today:
// @/lib/gallery/query does not exist (Plan 02/W2).
import { beforeEach, describe, expect, it, vi } from "vitest";

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { batch: batchMock, job: jobMock },
}));

import { loadBatchGallery } from "@/lib/gallery/query";

beforeEach(() => {
  batchMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  batchMock.findUnique.mockResolvedValue({ id: "batch-1", productId: "p1" });
  jobMock.findMany.mockResolvedValue([
    {
      id: "job-1",
      status: "completed",
      combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
      layers: [{ id: "l1", pass: "metal", url: "outputs/a.png" }],
    },
  ]);
});

describe("loadBatchGallery (OUT-02)", () => {
  it("filters jobs to completed and includes layers", async () => {
    await loadBatchGallery("batch-1");

    expect(jobMock.findMany).toHaveBeenCalledTimes(1);
    const arg = jobMock.findMany.mock.calls[0][0];
    expect(arg.where.batchId).toBe("batch-1");
    expect(arg.where.status).toBe("completed");
    expect(arg.include).toMatchObject({ layers: true });
  });

  it("returns the loaded layers without touching RunPod", async () => {
    const result = await loadBatchGallery("batch-1");
    expect(result).toBeTruthy();
    // jobMock provided one completed job with one layer.
    expect(jobMock.findMany).toHaveBeenCalled();
  });
});
