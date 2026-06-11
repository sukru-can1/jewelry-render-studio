// INTEL-05 (09-03) — applyIntelDecision: the operator Accept / Reject / Override
// Server Action. Mirrors orch-cancel/batch-create harness style: mock the RBAC
// boundary, the Prisma singleton (with a $transaction passthrough), next/cache,
// and the recipe generator (fixture return, so the call SHAPE is asserted).
//
// Security contract (threat model T-09-10/11/12):
//  - requireSession() FIRST — unauth throws 401 with NO read and NO write;
//  - zod-validate the untrusted input BEFORE any read (invalid enum -> no read);
//  - IDOR: the job is loaded WITH its batch; unknown job -> {ok:false}, no write;
//  - the operatorAction write is a GUARDED update (expected intelState) that
//    MERGES into the existing intel Json — the verdicts trace is never clobbered;
//  - reject re-queues a plain classic final (generator WITHOUT overrides);
//  - override ships a chosen iteration's override set; accept on ESCALATED ships
//    the frozen best. No GPU client import — re-dispatch flows via the queue.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: () => requireSession(),
  requireRole: vi.fn(),
}));

const jobMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
}));
const prismaMock = vi.hoisted(() => {
  const mock: Record<string, unknown> = { job: jobMock };
  mock.$transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(mock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return mock;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const recipeFixture = vi.hoisted(() => ({ render: { samples: 999 }, fixture: true }));
const buildEnterpriseRecipe = vi.hoisted(() =>
  vi.fn((_req: Record<string, unknown>) => recipeFixture),
);
vi.mock("@/lib/enterprise-recipes", () => ({ buildEnterpriseRecipe }));

import { applyIntelDecision } from "@/lib/intelligence/operator-actions";

const verdict = {
  scores: {
    diamondBrilliance: 3,
    metalHighlight: 4,
    metalBelievability: 4,
    exposureTonal: 3,
    stoneSymmetry: 4,
    contactShadow: 3,
    framing: 4,
    backgroundHoldout: 4,
  },
  flags: {
    milky: false,
    wrongMetal: false,
    brokenHoldout: false,
    blownHighlights: false,
    emptyOrBroken: false,
  },
  adjust: {
    worldStrengthDelta: -0.02,
    exposureDelta: 0,
    cardDarknessDelta: 0,
    contactShadowDelta: 0,
  },
  cameraPresetSuggestion: null,
  overallScore: 3,
  rationale: "Close but below the bar.",
};

function baseIntel() {
  return {
    iteration: 1,
    verdicts: [verdict],
    appliedOverrides: [{ worldStrength: 0.085 }],
    bestScore: 3,
    bestOverrides: { worldStrength: 0.085 },
    decision: "freeze-best",
    reason: "G4 stop-on-no-improvement.",
    guardrailHits: ["no_improvement"],
    cost: { visionCalls: 2, previewRenders: 2, finalRenders: 1 },
    request: {
      groupTokens: { alloycolour: ["band"], diamond: ["center"], stone2: [], stone3: [] },
      stoneMaterials: { diamond: "diamond", stone2: "diamond", stone3: "diamond" },
      productName: "ring99",
      preview: { samples: 16, resolution: 512 },
      final: { samples: 256, resolution: 2048 },
    },
    finalJobId: "job-final-1",
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    batchId: "batch-1",
    intelState: "FINAL_QUEUED",
    intel: baseIntel(),
    combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" },
    result: {},
    batch: { id: "batch-1", productId: "prod-1" },
    ...overrides,
  };
}

beforeEach(() => {
  requireSession.mockReset();
  requireSession.mockResolvedValue({ user: { id: "test-operator-id", role: "Operator" } });
  jobMock.findUnique.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.updateMany.mockResolvedValue({ count: 1 });
  jobMock.create.mockReset();
  jobMock.create.mockResolvedValue({ id: "job-requeued-1" });
  revalidatePath.mockReset();
  buildEnterpriseRecipe.mockClear();
});

describe("applyIntelDecision — auth + validation boundary (T-09-10)", () => {
  it("unauth -> throws 401 Response with NO read and NO write", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    await expect(
      applyIntelDecision({ jobId: "job-1", action: "accept" }),
    ).rejects.toBeInstanceOf(Response);
    expect(jobMock.findUnique).not.toHaveBeenCalled();
    expect(jobMock.updateMany).not.toHaveBeenCalled();
    expect(jobMock.create).not.toHaveBeenCalled();
  });

  it("invalid action enum -> {ok:false} with NO read and NO write", async () => {
    const res = await applyIntelDecision({ jobId: "job-1", action: "yolo" });
    expect(res.ok).toBe(false);
    expect(jobMock.findUnique).not.toHaveBeenCalled();
    expect(jobMock.updateMany).not.toHaveBeenCalled();
  });

  it("unknown job -> {ok:false} with NO write (IDOR — loaded WITH its batch)", async () => {
    jobMock.findUnique.mockResolvedValueOnce(null);
    const res = await applyIntelDecision({ jobId: "ghost", action: "accept" });
    expect(res.ok).toBe(false);
    // the job is looked up by id and scoped through its batch include.
    const arg = jobMock.findUnique.mock.calls[0][0];
    expect(arg.where.id).toBe("ghost");
    expect(arg.include?.batch).toBeTruthy();
    expect(jobMock.updateMany).not.toHaveBeenCalled();
    expect(jobMock.create).not.toHaveBeenCalled();
  });

  it("a non-reviewable state (ANALYZING) -> {ok:false}, no write", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intelState: "ANALYZING" }));
    const res = await applyIntelDecision({ jobId: "job-1", action: "accept" });
    expect(res.ok).toBe(false);
    expect(jobMock.updateMany).not.toHaveBeenCalled();
  });

  it("an already-reviewed job (operatorAction present) -> {ok:false}, no write", async () => {
    const intel = {
      ...baseIntel(),
      operatorAction: { action: "accept", userId: "u-0", at: "2026-06-10T00:00:00.000Z" },
    };
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intel }));
    const res = await applyIntelDecision({ jobId: "job-1", action: "reject" });
    expect(res.ok).toBe(false);
    expect(jobMock.updateMany).not.toHaveBeenCalled();
  });
});

describe("applyIntelDecision — accept (T-09-12: logged, never silent)", () => {
  it("accept on FINAL_QUEUED logs operatorAction via a GUARDED update, trace intact", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow());
    const res = await applyIntelDecision({ jobId: "job-1", action: "accept" });
    expect(res).toEqual({ ok: true });

    const write = jobMock.updateMany.mock.calls[0][0];
    // Guarded on the expected prior intelState — a concurrent transition writes 0 rows.
    expect(write.where).toEqual({ id: "job-1", intelState: "FINAL_QUEUED" });
    const intel = write.data.intel;
    expect(intel.operatorAction.action).toBe("accept");
    expect(intel.operatorAction.userId).toBe("test-operator-id");
    expect(Number.isNaN(Date.parse(intel.operatorAction.at))).toBe(false);
    // MERGED — the verdicts trace and cost are preserved, never clobbered.
    expect(intel.verdicts).toEqual([verdict]);
    expect(intel.cost).toEqual(baseIntel().cost);
    // FINAL already queued by the loop — approval is log-only, no new render.
    expect(jobMock.create).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/batches/batch-1");
  });

  it("accept on ESCALATED queues the frozen-best FINAL through the generator", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intelState: "ESCALATED" }));
    const res = await applyIntelDecision({ jobId: "job-1", action: "accept" });
    expect(res).toEqual({ ok: true });
    // The frozen best override set ships; quality = the FINAL tier from the trace.
    const req = buildEnterpriseRecipe.mock.calls[0][0];
    expect(req.profileOverrides).toEqual({ worldStrength: 0.085 });
    expect(req.samples).toBe(256);
    expect(req.resolution).toBe(2048);
    const created = jobMock.create.mock.calls[0][0];
    expect(created.data.status).toBe("queued");
    expect(created.data.batchId).toBe("batch-1");
    expect(created.data.recipe).toBe(recipeFixture);
    // A classic row — the loop is over; no intel state seeds on the re-queue.
    expect(created.data.intelState).toBeUndefined();
  });

  it("a lost guarded claim (count 0) -> {ok:false} and NO re-queue", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intelState: "ESCALATED" }));
    jobMock.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await applyIntelDecision({ jobId: "job-1", action: "accept" });
    expect(res.ok).toBe(false);
    expect(jobMock.create).not.toHaveBeenCalled();
  });
});

describe("applyIntelDecision — reject re-queues classic (no AI overrides)", () => {
  it("reject queues a plain classic final: generator called WITHOUT profileOverrides", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intelState: "ESCALATED" }));
    const res = await applyIntelDecision({ jobId: "job-1", action: "reject" });
    expect(res).toEqual({ ok: true });

    const req = buildEnterpriseRecipe.mock.calls[0][0];
    expect(req.profileOverrides).toBeUndefined();
    expect(req.angle).toBe("hero");
    expect(req.metal).toBe("white");
    expect(req.pass).toBe("stone");
    expect(req.stoneGroup).toBe("diamond");
    expect(req.samples).toBe(256);
    expect(req.resolution).toBe(2048);

    const created = jobMock.create.mock.calls[0][0];
    expect(created.data.status).toBe("queued");
    expect(created.data.recipe).toBe(recipeFixture);

    // The re-queued job id is attached to the logged action (audit link).
    const lastWrite = jobMock.updateMany.mock.calls.at(-1)![0];
    expect(lastWrite.data.intel.operatorAction.action).toBe("reject");
    expect(lastWrite.data.intel.operatorAction.queuedJobId).toBe("job-requeued-1");
  });

  it("reject with a corrupt trace (no request context) -> {ok:false}, no write", async () => {
    const intel = { ...baseIntel(), request: undefined };
    jobMock.findUnique.mockResolvedValueOnce(jobRow({ intel, intelState: "ESCALATED" }));
    const res = await applyIntelDecision({ jobId: "job-1", action: "reject" });
    expect(res.ok).toBe(false);
    expect(jobMock.updateMany).not.toHaveBeenCalled();
    expect(jobMock.create).not.toHaveBeenCalled();
  });
});

describe("applyIntelDecision — override ships a chosen iteration's set", () => {
  it("override iteration 1 ships appliedOverrides[0] and logs overrideIteration", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow());
    const res = await applyIntelDecision({
      jobId: "job-1",
      action: "override",
      overrideIteration: 1,
    });
    expect(res).toEqual({ ok: true });
    const req = buildEnterpriseRecipe.mock.calls[0][0];
    expect(req.profileOverrides).toEqual({ worldStrength: 0.085 });
    const lastWrite = jobMock.updateMany.mock.calls.at(-1)![0];
    expect(lastWrite.data.intel.operatorAction.action).toBe("override");
    expect(lastWrite.data.intel.operatorAction.overrideIteration).toBe(1);
  });

  it("override iteration 0 ships the seed (generator WITHOUT overrides)", async () => {
    jobMock.findUnique.mockResolvedValueOnce(jobRow());
    const res = await applyIntelDecision({
      jobId: "job-1",
      action: "override",
      overrideIteration: 0,
    });
    expect(res).toEqual({ ok: true });
    expect(buildEnterpriseRecipe.mock.calls[0][0].profileOverrides).toBeUndefined();
  });

  it("override with a missing/unknown iteration -> {ok:false}, no write", async () => {
    jobMock.findUnique.mockResolvedValue(jobRow());
    const missing = await applyIntelDecision({ jobId: "job-1", action: "override" });
    expect(missing.ok).toBe(false);
    const oob = await applyIntelDecision({
      jobId: "job-1",
      action: "override",
      overrideIteration: 5,
    });
    expect(oob.ok).toBe(false);
    expect(jobMock.updateMany).not.toHaveBeenCalled();
    expect(jobMock.create).not.toHaveBeenCalled();
  });
});
