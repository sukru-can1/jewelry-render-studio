// ORCH-05 — cancelBatch / cancelJob Server Actions.
// Import target: @/lib/orchestration/cancel (Wave 2) + @/lib/runpod cancelRunPod
// (Wave 1, 04-04) → RED.
//
// Asserts: requireSession() first; IDOR-reject an unknown/not-owned id with NO
// write; cancelRunPod(runpodJobId) for cancelable jobs; status→cancelled +
// cancelRequestedAt audit timestamp; KEEP completed jobs. CRITICALLY also asserts
// the cancelRunPod CALL SHAPE — POST to /v2/{endpoint}/cancel/{runpodJobId} (W-3).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

const requireSession = vi.hoisted(() => vi.fn(async () => fakeSession("Operator")));
vi.mock("@/lib/auth/rbac", () => ({ requireSession, requireRole: vi.fn() }));

const cancelRunPod = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runpod", () => ({ cancelRunPod, submitRunPod: vi.fn(), getRunPodStatus: vi.fn() }));

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { batch: batchMock, job: jobMock } }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

// 04-04 turned this GREEN: lib/orchestration/cancel now exists and is type-correct.
import { cancelBatch, cancelJob } from "@/lib/orchestration/cancel";

beforeEach(() => {
  requireSession.mockClear();
  cancelRunPod.mockReset();
  batchMock.findUnique.mockReset();
  batchMock.update.mockReset();
  batchMock.updateMany.mockReset();
  jobMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  jobMock.update.mockReset();
  jobMock.updateMany.mockReset();
  revalidatePath.mockReset();
});

describe("cancelJob (ORCH-05, RED)", () => {
  it("calls requireSession first", async () => {
    jobMock.findUnique.mockResolvedValue(null);
    await cancelJob("job-x").catch(() => {});
    expect(requireSession).toHaveBeenCalled();
  });

  it("IDOR-rejects an unknown job with no write", async () => {
    jobMock.findUnique.mockResolvedValue(null);
    const res = await cancelJob("nope");
    expect(res.ok).toBe(false);
    expect(jobMock.update).not.toHaveBeenCalled();
    expect(cancelRunPod).not.toHaveBeenCalled();
  });

  it("cancelable job → cancelRunPod(runpodJobId) + status cancelled + cancelRequestedAt", async () => {
    jobMock.findUnique.mockResolvedValue({ id: "job-1", status: "in_progress", runpodJobId: "rp-1" });
    await cancelJob("job-1");
    expect(cancelRunPod).toHaveBeenCalledWith("rp-1");
    const write = jobMock.update.mock.calls[0][0];
    expect(write.data.status).toBe("cancelled");
    expect(write.data.cancelRequestedAt).toBeInstanceOf(Date);
  });

  it("KEEPS a completed job (no cancel write, no RunPod call)", async () => {
    jobMock.findUnique.mockResolvedValue({ id: "job-1", status: "completed", runpodJobId: "rp-1" });
    await cancelJob("job-1");
    expect(cancelRunPod).not.toHaveBeenCalled();
    const cancelled = jobMock.update.mock.calls.some((c) => c[0]?.data?.status === "cancelled");
    expect(cancelled).toBe(false);
  });
});

describe("cancelBatch (ORCH-05, RED)", () => {
  it("IDOR-rejects an unknown batch with no write", async () => {
    batchMock.findUnique.mockResolvedValue(null);
    const res = await cancelBatch("nope");
    expect(res.ok).toBe(false);
    expect(batchMock.update).not.toHaveBeenCalled();
  });
});

// W-3: cancelRunPod call-shape coverage — POST /v2/{endpoint}/cancel/{id}.
// This drives 04-04 Task 1 (the real cancelRunPod helper, NOT yet built) → RED.
describe("cancelRunPod call shape (W-3, RED)", () => {
  it("POSTs to /v2/{endpoint}/cancel/{runpodJobId}", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    process.env.RUNPOD_API_KEY = "k";
    process.env.RUNPOD_ENDPOINT_ID = "ep";
    try {
      // Import the REAL helper (Wave 1 / 04-04), bypassing the file-level mock via
      // importActual — RED until lib/runpod actually exports cancelRunPod.
      const mod = await vi.importActual<Record<string, unknown>>("@/lib/runpod");
      const realCancel = (mod as Record<string, unknown>).cancelRunPod as
        | ((id: string) => Promise<unknown>)
        | undefined;
      expect(typeof realCancel).toBe("function");
      await realCancel!("rp-1");
      const url = String(fetchSpy.mock.calls[0][0]);
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(url).toMatch(/\/v2\/ep\/cancel\/rp-1$/);
      expect((init.method || "GET").toUpperCase()).toBe("POST");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
