// INTEL-04 (Phase 9) — sweepAnalyzingJobs: the ANALYZING cron sweep state machine.
// Mocks prisma, analyzePreview, buildEnterpriseRecipe and env (the vision scorer +
// generator are wired, never executed); the PURE decideLoop/applyDeltas from 09-01
// run for REAL so the sweep stays honest wiring with no decision logic of its own.
//
// Asserts (T-09-06/07/08 mitigations):
//  - G9 kill-switch: no OPENAI_API_KEY or ADAPTIVE_INTELLIGENCE_ENABLED="false"
//    -> {analyzed:0} with NO prisma read;
//  - optimistic claim (ANALYZING -> ANALYZING_IN_PROGRESS): a lost claim
//    (count===0) skips — no analysis, no double-dispatch;
//  - accept -> a full-sample FINAL Job queued via buildEnterpriseRecipe with the
//    frozen best overrides; this job -> FINAL_QUEUED + finalJobId link;
//  - autoCorrect at iteration 0 -> a new PREVIEW_QUEUED low-sample Job carrying
//    applyDeltas overrides + iteration 1; this job -> ADJUSTED + previewJobId;
//  - brokenHoldout -> ESCALATED with NO re-dispatch (G6);
//  - visionCalls already at 2 -> NO vision call, freeze-best -> FINAL with a
//    "cost_cap" guardrail hit (G8);
//  - G10: the recipe persisted on every re-dispatched Job IS the object returned
//    by buildEnterpriseRecipe — never hand-built JSON.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VisionVerdict } from "@/lib/intelligence/verdict";

const envMock = vi.hoisted(() => ({
  env: {
    OPENAI_API_KEY: "sk-test" as string | undefined,
    ADAPTIVE_INTELLIGENCE_ENABLED: undefined as string | undefined,
  },
}));
vi.mock("@/lib/env", () => envMock);

const jobMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

const analyzePreviewMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intelligence/analyze-preview", () => ({
  analyzePreview: (...a: unknown[]) => analyzePreviewMock(...a),
}));

// The ONLY legitimate recipe source (G10). The sweep must persist EXACTLY this
// object on any Job it creates.
const recipeFixture = vi.hoisted(() => ({ marker: "built-by-buildEnterpriseRecipe" }));
const buildRecipeMock = vi.hoisted(() => vi.fn(() => recipeFixture));
vi.mock("@/lib/enterprise-recipes", () => ({
  buildEnterpriseRecipe: (...a: unknown[]) => buildRecipeMock(...a),
}));

import { sweepAnalyzingJobs } from "@/lib/intelligence/sweep";

function verdictFixture(over: {
  scores?: Partial<VisionVerdict["scores"]>;
  flags?: Partial<VisionVerdict["flags"]>;
  adjust?: Partial<VisionVerdict["adjust"]>;
  overallScore?: number;
} = {}): VisionVerdict {
  return {
    scores: {
      diamondBrilliance: 5,
      metalHighlight: 4,
      metalBelievability: 5,
      exposureTonal: 4,
      stoneSymmetry: 4,
      contactShadow: 4,
      framing: 4,
      backgroundHoldout: 4,
      ...(over.scores ?? {}),
    },
    flags: {
      milky: false,
      wrongMetal: false,
      brokenHoldout: false,
      blownHighlights: false,
      emptyOrBroken: false,
      ...(over.flags ?? {}),
    },
    adjust: {
      worldStrengthDelta: 0,
      exposureDelta: 0,
      cardDarknessDelta: 0,
      contactShadowDelta: 0,
      ...(over.adjust ?? {}),
    },
    cameraPresetSuggestion: null,
    overallScore: over.overallScore ?? 5,
    rationale: "fixture",
  };
}

function analyzingJob(intelOver: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    batchId: "batch-1",
    status: "completed",
    intelState: "ANALYZING",
    combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
    result: {
      image_blob: { pathname: "renders/job-1/preview.png", content_type: "image/png" },
    },
    intel: {
      iteration: 0,
      verdicts: [],
      appliedOverrides: [],
      guardrailHits: [],
      cost: { visionCalls: 0, previewRenders: 1, finalRenders: 0 },
      request: {
        groupTokens: { alloycolour: ["band"], diamond: ["center"], stone2: [], stone3: [] },
        stoneMaterials: { diamond: "diamond", stone2: "diamond", stone3: "diamond" },
        productName: "ring99",
        preview: { samples: 64, resolution: 1024 },
        final: { samples: 512, resolution: 1920 },
      },
      ...intelOver,
    },
  };
}

type Where = { id?: string; intelState?: string };
type Write = {
  where: Where;
  data: {
    intelState?: string;
    intel?: {
      decision?: string;
      reason?: string;
      iteration?: number;
      guardrailHits?: string[];
      appliedOverrides?: Record<string, number | string>[];
      cost?: { visionCalls: number; previewRenders: number; finalRenders: number };
      finalJobId?: string;
      previewJobId?: string;
      bestScore?: number;
    };
  };
};

/** The post-claim transition write (claim writes ANALYZING_IN_PROGRESS). */
function transitionCall(): Write | undefined {
  return jobMock.updateMany.mock.calls
    .map((c) => c[0] as Write)
    .find((w) => w.data.intelState !== "ANALYZING_IN_PROGRESS");
}

beforeEach(() => {
  jobMock.findMany.mockReset();
  jobMock.updateMany.mockReset();
  jobMock.create.mockReset();
  analyzePreviewMock.mockReset();
  buildRecipeMock.mockClear();
  envMock.env.OPENAI_API_KEY = "sk-test";
  envMock.env.ADAPTIVE_INTELLIGENCE_ENABLED = undefined;

  jobMock.findMany.mockResolvedValue([analyzingJob()]);
  jobMock.updateMany.mockResolvedValue({ count: 1 });
  jobMock.create.mockResolvedValue({ id: "new-1" });
});

describe("sweepAnalyzingJobs — kill-switch (G9 / T-09-08)", () => {
  it("no OPENAI_API_KEY -> {analyzed:0} and NO prisma read", async () => {
    envMock.env.OPENAI_API_KEY = undefined;
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 0 });
    expect(jobMock.findMany).not.toHaveBeenCalled();
    expect(analyzePreviewMock).not.toHaveBeenCalled();
  });

  it('ADAPTIVE_INTELLIGENCE_ENABLED="false" -> {analyzed:0} and NO prisma read', async () => {
    envMock.env.ADAPTIVE_INTELLIGENCE_ENABLED = "false";
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 0 });
    expect(jobMock.findMany).not.toHaveBeenCalled();
  });

  it("only claims jobs whose batch is opted in (per-batch G9 gate in the where)", async () => {
    analyzePreviewMock.mockResolvedValue(verdictFixture());
    await sweepAnalyzingJobs();
    const where = jobMock.findMany.mock.calls[0][0].where as {
      intelState: string;
      batch: { optimizeWithAi: boolean };
    };
    expect(where.intelState).toBe("ANALYZING");
    expect(where.batch.optimizeWithAi).toBe(true);
  });
});

describe("sweepAnalyzingJobs — optimistic claim (T-09-06 idempotency)", () => {
  it("a lost claim (count===0) skips: no analysis, no writes, no dispatch", async () => {
    jobMock.updateMany.mockResolvedValueOnce({ count: 0 }); // concurrent tick won
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 0 });
    expect(analyzePreviewMock).not.toHaveBeenCalled();
    expect(jobMock.create).not.toHaveBeenCalled();
    // Exactly one updateMany: the failed claim guarded on intelState ANALYZING.
    expect(jobMock.updateMany).toHaveBeenCalledTimes(1);
    const claim = jobMock.updateMany.mock.calls[0][0] as Write;
    expect(claim.where).toMatchObject({ id: "job-1", intelState: "ANALYZING" });
    expect(claim.data.intelState).toBe("ANALYZING_IN_PROGRESS");
  });
});

describe("sweepAnalyzingJobs — accept -> FINAL (INTEL-04)", () => {
  it("queues a full-sample FINAL via buildEnterpriseRecipe and flips to FINAL_QUEUED", async () => {
    analyzePreviewMock.mockResolvedValue(verdictFixture()); // catalog-ready
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 1 });

    // The FINAL render uses the FINAL quality from the persisted request.
    expect(buildRecipeMock).toHaveBeenCalledTimes(1);
    const req = buildRecipeMock.mock.calls[0][0] as {
      samples: number;
      resolution: number;
      profileOverrides?: unknown;
      angle: string;
      metal: string;
      pass: string;
    };
    expect(req.samples).toBe(512);
    expect(req.resolution).toBe(1920);
    expect(req.angle).toBe("hero");
    expect(req.metal).toBe("white");
    expect(req.pass).toBe("metal");
    // No overrides were ever applied -> the FINAL ships the identity recipe.
    expect(req.profileOverrides).toBeUndefined();

    // G10: the persisted recipe IS the generator output object.
    expect(jobMock.create).toHaveBeenCalledTimes(1);
    const created = jobMock.create.mock.calls[0][0].data as {
      batchId: string;
      status: string;
      recipe: unknown;
    };
    expect(created.batchId).toBe("batch-1");
    expect(created.status).toBe("queued");
    expect(created.recipe).toBe(recipeFixture);

    // This job: ANALYZING_IN_PROGRESS -> FINAL_QUEUED with the audit trace.
    const t = transitionCall();
    expect(t?.where).toMatchObject({ id: "job-1", intelState: "ANALYZING_IN_PROGRESS" });
    expect(t?.data.intelState).toBe("FINAL_QUEUED");
    expect(t?.data.intel?.decision).toBe("accept");
    expect(t?.data.intel?.finalJobId).toBe("new-1");
    expect(t?.data.intel?.cost).toEqual({ visionCalls: 1, previewRenders: 1, finalRenders: 1 });
    expect(t?.data.intel?.bestScore).toBe(5);
  });
});

describe("sweepAnalyzingJobs — autoCorrect -> adjusted re-preview (INTEL-04)", () => {
  it("creates a PREVIEW_QUEUED job with applyDeltas overrides at iteration 1", async () => {
    analyzePreviewMock.mockResolvedValue(
      verdictFixture({
        scores: { diamondBrilliance: 3 },
        adjust: { worldStrengthDelta: -0.03 },
        overallScore: 3,
      }),
    );
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 1 });

    // The re-preview renders LOW samples with the clamped absolute overrides.
    const req = buildRecipeMock.mock.calls[0][0] as {
      samples: number;
      profileOverrides?: { worldStrength?: number };
    };
    expect(req.samples).toBe(64);
    expect(req.profileOverrides?.worldStrength).toBeCloseTo(0.075, 10); // 0.105 - 0.03

    const created = jobMock.create.mock.calls[0][0].data as {
      status: string;
      intelState: string;
      recipe: unknown;
      intel: {
        iteration: number;
        appliedOverrides: { worldStrength?: number }[];
        cost: { visionCalls: number; previewRenders: number };
      };
    };
    expect(created.status).toBe("queued");
    expect(created.intelState).toBe("PREVIEW_QUEUED");
    expect(created.recipe).toBe(recipeFixture); // G10
    expect(created.intel.iteration).toBe(1);
    expect(created.intel.appliedOverrides).toHaveLength(1);
    expect(created.intel.appliedOverrides[0].worldStrength).toBeCloseTo(0.075, 10);
    expect(created.intel.cost).toMatchObject({ visionCalls: 1, previewRenders: 2 });

    // This job: -> ADJUSTED, linked to the new preview.
    const t = transitionCall();
    expect(t?.data.intelState).toBe("ADJUSTED");
    expect(t?.data.intel?.decision).toBe("autoCorrect");
    expect(t?.data.intel?.previewJobId).toBe("new-1");
  });
});

describe("sweepAnalyzingJobs — escalate (G6, T-09-06)", () => {
  it("brokenHoldout -> ESCALATED with NO re-dispatch", async () => {
    analyzePreviewMock.mockResolvedValue(
      verdictFixture({ flags: { brokenHoldout: true }, overallScore: 2 }),
    );
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 1 });

    expect(jobMock.create).not.toHaveBeenCalled();
    expect(buildRecipeMock).not.toHaveBeenCalled();

    const t = transitionCall();
    expect(t?.data.intelState).toBe("ESCALATED");
    expect(t?.data.intel?.decision).toBe("escalate");
    expect(t?.data.intel?.reason).toMatch(/holdout/i);
  });
});

describe("sweepAnalyzingJobs — cost cap (G8)", () => {
  it("visionCalls already 2 -> NO vision call, freeze-best -> FINAL with cost_cap hit", async () => {
    jobMock.findMany.mockResolvedValue([
      analyzingJob({
        cost: { visionCalls: 2, previewRenders: 2, finalRenders: 0 },
        bestScore: 3,
        bestOverrides: { worldStrength: 0.08 },
      }),
    ]);
    const res = await sweepAnalyzingJobs();
    expect(res).toEqual({ analyzed: 1 });

    expect(analyzePreviewMock).not.toHaveBeenCalled();

    // FINAL ships the frozen BEST overrides, full samples.
    const req = buildRecipeMock.mock.calls[0][0] as {
      samples: number;
      profileOverrides?: { worldStrength?: number };
    };
    expect(req.samples).toBe(512);
    expect(req.profileOverrides?.worldStrength).toBeCloseTo(0.08, 10);

    const t = transitionCall();
    expect(t?.data.intelState).toBe("FINAL_QUEUED");
    expect(t?.data.intel?.decision).toBe("freeze-best");
    expect(t?.data.intel?.guardrailHits).toContain("cost_cap");
    expect(t?.data.intel?.finalJobId).toBe("new-1");
  });
});
