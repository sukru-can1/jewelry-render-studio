// INTEL-04 wire-in (Phase 9, Task 3) — the three integration points of the loop:
//  1. webhook.ts completed branch: an intelligence-preview job (intelState
//     "PREVIEW_QUEUED") is FLIPPED to "ANALYZING" via a guarded updateMany —
//     fast, idempotent, NO vision call (T-09-09); a classic job (intelState
//     null) is untouched; a duplicate completion no-ops (count 0).
//  2. createBatch honors optimizeWithAi behind the G9 kill-switch: opted-in
//     batches seed PREVIEW_QUEUED jobs with the intel trace + LOW-sample preview
//     recipes; otherwise behavior is EXACTLY today (intelState absent).
//  3. the reconcile cron route also runs sweepAnalyzingJobs and reports
//     {analyzed} (the slow vision call lives on the cron tick, never the webhook).
// Mocks prisma/rbac/layers/env/next-cache + the orchestration modules the cron
// route composes (mirrors test/orch-webhook.test.ts + test/batch-create.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

const envMock = vi.hoisted(() => ({
  env: {
    OPENAI_API_KEY: "sk-test" as string | undefined,
    ADAPTIVE_INTELLIGENCE_ENABLED: undefined as string | undefined,
  },
}));
vi.mock("@/lib/env", () => envMock);

const requireSessionMock = vi.hoisted(() => vi.fn(async () => fakeSession("Operator")));
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

const jobMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
}));
const batchMock = vi.hoisted(() => ({ create: vi.fn() }));
const productMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const qualityMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  job: jobMock,
  batch: batchMock,
  product: productMock,
  qualityPreset: qualityMock,
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const deriveLayerMock = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => undefined));
vi.mock("@/lib/orchestration/layers", () => ({
  deriveLayerFromResult: (...a: unknown[]) => deriveLayerMock(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The cron-route composition: reconcile/retry/sweep are mocked spies so the
// route test asserts pure wiring (the sweep itself is tested in intel-sweep).
const reconcileJobsMock = vi.hoisted(() => vi.fn(async () => ({ polled: 1 })));
const sweepStrandedMock = vi.hoisted(() => vi.fn(async () => ({ releasedStranded: 0 })));
vi.mock("@/lib/orchestration/reconcile", () => ({
  reconcileJobs: reconcileJobsMock,
  sweepStrandedJobs: sweepStrandedMock,
}));
const retryMock = vi.hoisted(() => vi.fn(async () => ({ requeued: 0 })));
vi.mock("@/lib/orchestration/retry", () => ({ retryFailedJobs: retryMock }));
const sweepAnalyzingMock = vi.hoisted(() => vi.fn(async () => ({ analyzed: 2 })));
vi.mock("@/lib/intelligence/sweep", () => ({
  sweepAnalyzingJobs: sweepAnalyzingMock,
}));

import { applyWebhookResult } from "@/lib/orchestration/webhook";
import { createBatch } from "@/lib/batches/actions";

type Write = { where: Record<string, unknown>; data: Record<string, unknown> };

beforeEach(() => {
  jobMock.findFirst.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.update.mockReset();
  jobMock.createMany.mockReset();
  batchMock.create.mockReset();
  productMock.findUnique.mockReset();
  qualityMock.findFirst.mockReset();
  prismaMock.$transaction.mockClear();
  deriveLayerMock.mockClear();
  reconcileJobsMock.mockClear();
  sweepStrandedMock.mockClear();
  retryMock.mockClear();
  sweepAnalyzingMock.mockClear();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));
  envMock.env.OPENAI_API_KEY = "sk-test";
  envMock.env.ADAPTIVE_INTELLIGENCE_ENABLED = undefined;

  jobMock.updateMany.mockResolvedValue({ count: 1 });
  jobMock.createMany.mockResolvedValue({ count: 4 });
  batchMock.create.mockResolvedValue({ id: "b1", jobCount: 4 });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. webhook completed branch — the fast ANALYZING flip (T-09-09)
// ─────────────────────────────────────────────────────────────────────────────
describe("webhook flips an intelligence-preview job to ANALYZING (fast, guarded)", () => {
  it("PREVIEW_QUEUED -> ANALYZING via guarded updateMany after the result write", async () => {
    jobMock.findFirst.mockResolvedValue({
      id: "job-1",
      combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
      intelState: "PREVIEW_QUEUED",
    });

    await applyWebhookResult({
      id: "runpod-1",
      status: "COMPLETED",
      output: { image_blob: { pathname: "renders/job-1/preview.png" } },
    });

    // Call 0 = the existing status/result write; call 1 = the intel flip.
    expect(jobMock.updateMany).toHaveBeenCalledTimes(2);
    const flip = jobMock.updateMany.mock.calls[1][0] as Write;
    expect(flip.where).toMatchObject({ id: "job-1", intelState: "PREVIEW_QUEUED" });
    expect(flip.data).toEqual({ intelState: "ANALYZING" });
    // The layer derivation still ran (classic completion path untouched).
    expect(deriveLayerMock).toHaveBeenCalledTimes(1);
  });

  it("a classic job (intelState null) is NOT flipped — no extra updateMany", async () => {
    jobMock.findFirst.mockResolvedValue({
      id: "job-2",
      combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
      intelState: null,
    });

    await applyWebhookResult({
      id: "runpod-2",
      status: "COMPLETED",
      output: { image_blob: { pathname: "renders/job-2/x.png" } },
    });

    // Only the status/result write — the classic path is byte-identical.
    expect(jobMock.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a duplicate completion no-ops: the flip matches zero rows and nothing throws", async () => {
    jobMock.findFirst.mockResolvedValue({
      id: "job-1",
      combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
      intelState: "PREVIEW_QUEUED",
    });
    jobMock.updateMany.mockResolvedValue({ count: 0 }); // settled job + already-flipped

    await expect(
      applyWebhookResult({ id: "runpod-1", status: "COMPLETED", output: {} }),
    ).resolves.toBeUndefined();
  });

  it("a non-completed status never touches intelState", async () => {
    await applyWebhookResult({ id: "runpod-1", status: "IN_PROGRESS" });
    expect(jobMock.findFirst).not.toHaveBeenCalled();
    expect(jobMock.updateMany).toHaveBeenCalledTimes(1);
    const write = jobMock.updateMany.mock.calls[0][0] as Write;
    expect(write.data.intelState).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. createBatch optimizeWithAi opt-in (G9-gated preview seeding)
// ─────────────────────────────────────────────────────────────────────────────
function readyProduct() {
  return {
    id: "p1",
    name: "Ring 99",
    status: "ready",
    assignments: [
      { group: "alloycolour", objectTokens: ["band_metal gold"] },
      { group: "diamond", objectTokens: ["center_diamond glass"] },
    ],
  };
}

function validInput(over: Record<string, unknown> = {}) {
  return {
    productId: "p1",
    angleViewKeys: ["view1", "view2"],
    metalKeys: ["white"],
    stoneTypeByGroup: { diamond: "diamond" },
    passes: ["metal", "diamond"],
    qualityKey: "high",
    ...over,
  };
}

type JobRow = {
  status: string;
  intelState?: string;
  recipe: { render?: { samples?: number } };
  intel?: {
    iteration: number;
    cost: { visionCalls: number; previewRenders: number; finalRenders: number };
    request?: {
      productName: string;
      preview: { samples: number };
      final: { samples: number };
    };
  };
};

function seedQualityMocks() {
  productMock.findUnique.mockResolvedValue(readyProduct());
  qualityMock.findFirst.mockImplementation(async (args: { where?: { key?: string } }) =>
    args?.where?.key === "preview"
      ? { key: "preview", samples: 64, width: 1024, height: 1024 }
      : { key: "high", samples: 512, width: 1920, height: 1920 },
  );
}

describe("createBatch — optimizeWithAi seeds intelligence previews (G9-gated)", () => {
  it("opted in + key present: PREVIEW_QUEUED jobs with intel trace + LOW-sample recipes", async () => {
    seedQualityMocks();

    const result = await createBatch(validInput({ optimizeWithAi: true }));
    expect(result.ok).toBe(true);

    // The Batch row records the (kill-switch-resolved) opt-in.
    expect(batchMock.create.mock.calls[0][0].data.optimizeWithAi).toBe(true);

    const rows = jobMock.createMany.mock.calls[0][0].data as JobRow[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.status).toBe("queued");
      expect(row.intelState).toBe("PREVIEW_QUEUED");
      // LOW preview samples on the seeded recipe (not the selected 512).
      expect(row.recipe.render?.samples).toBe(64);
      expect(row.intel?.iteration).toBe(0);
      expect(row.intel?.cost).toEqual({ visionCalls: 0, previewRenders: 1, finalRenders: 0 });
      // The persisted request context carries BOTH qualities for the sweep.
      expect(row.intel?.request?.preview.samples).toBe(64);
      expect(row.intel?.request?.final.samples).toBe(512);
      expect(row.intel?.request?.productName).toBe("Ring 99");
    }
  });

  it("optimizeWithAi absent: behavior is EXACTLY today (no intelState, full samples)", async () => {
    seedQualityMocks();

    const result = await createBatch(validInput());
    expect(result.ok).toBe(true);

    expect(batchMock.create.mock.calls[0][0].data.optimizeWithAi).toBe(false);
    const rows = jobMock.createMany.mock.calls[0][0].data as JobRow[];
    for (const row of rows) {
      expect(row.intelState).toBeUndefined();
      expect(row.intel).toBeUndefined();
      expect(row.recipe.render?.samples).toBe(512); // the selected quality
    }
  });

  it("kill-switch: opted in but OPENAI_API_KEY absent -> classic batch (G9)", async () => {
    seedQualityMocks();
    envMock.env.OPENAI_API_KEY = undefined;

    const result = await createBatch(validInput({ optimizeWithAi: true }));
    expect(result.ok).toBe(true);

    expect(batchMock.create.mock.calls[0][0].data.optimizeWithAi).toBe(false);
    const rows = jobMock.createMany.mock.calls[0][0].data as JobRow[];
    for (const row of rows) {
      expect(row.intelState).toBeUndefined();
      expect(row.recipe.render?.samples).toBe(512);
    }
  });

  it('kill-switch: ADAPTIVE_INTELLIGENCE_ENABLED="false" -> classic batch (G9)', async () => {
    seedQualityMocks();
    envMock.env.ADAPTIVE_INTELLIGENCE_ENABLED = "false";

    const result = await createBatch(validInput({ optimizeWithAi: true }));
    expect(result.ok).toBe(true);

    expect(batchMock.create.mock.calls[0][0].data.optimizeWithAi).toBe(false);
    const rows = jobMock.createMany.mock.calls[0][0].data as JobRow[];
    for (const row of rows) expect(row.intelState).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. reconcile cron route — also runs the ANALYZING sweep
// ─────────────────────────────────────────────────────────────────────────────
describe("reconcile cron route runs sweepAnalyzingJobs (the vision call's home)", () => {
  it("GET with the CRON_SECRET bearer runs the sweep and reports {analyzed}", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/cron/reconcile/route");

    const req = new Request("http://localhost/api/cron/reconcile", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sweepAnalyzingMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ polled: 1, releasedStranded: 0, requeued: 0, analyzed: 2 });
  });

  it("an unauthorized caller never reaches the sweep", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const { GET } = await import("@/app/api/cron/reconcile/route");

    const res = await GET(new Request("http://localhost/api/cron/reconcile"));
    expect(res.status).toBe(401);
    expect(sweepAnalyzingMock).not.toHaveBeenCalled();
  });
});
