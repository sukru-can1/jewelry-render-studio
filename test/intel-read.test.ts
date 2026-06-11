// INTEL-05 (09-03) — loadBatchIntel: the DB-only per-job intel projection the
// batch detail page feeds to the operator intel panel. Mirrors the harness style
// of orch-progress/orch-cancel: mock the Prisma singleton, assert the projection.
//
// Asserts:
//  - the query filters to intelligence jobs (intelState NOT null) on the batch;
//  - scores/flags/deltas/rationale/decision/operatorAction project from Job.intel;
//  - previewThumbUrl is the auth-gated file-proxy URL built from
//    result.image_blob.pathname (the browser session IS authed — T-09-13);
//  - a null or partial intel Json never throws (tolerant defaults);
//  - escalateReason surfaces ONLY for ESCALATED jobs;
//  - the pure view helpers (scoreTone / activeFlags / delta formatting /
//    overridesForIteration / isReviewable) encode the panel's presentational logic.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { job: jobMock } }));

import { loadBatchIntel } from "@/lib/intelligence/read";
import {
  activeFlags,
  appliedOverrideEntries,
  formatSignedDelta,
  isReviewable,
  overrideIterationOptions,
  overridesForIteration,
  proposedDeltaEntries,
  scoreTone,
} from "@/lib/intelligence/view";

const verdict = {
  scores: {
    diamondBrilliance: 2,
    metalHighlight: 4,
    metalBelievability: 4,
    exposureTonal: 3,
    stoneSymmetry: 4,
    contactShadow: 3,
    framing: 5,
    backgroundHoldout: 4,
  },
  flags: {
    milky: true,
    wrongMetal: false,
    brokenHoldout: false,
    blownHighlights: false,
    emptyOrBroken: false,
  },
  adjust: {
    worldStrengthDelta: -0.02,
    exposureDelta: 0,
    cardDarknessDelta: 0.2,
    contactShadowDelta: 0,
  },
  cameraPresetSuggestion: null,
  overallScore: 3,
  rationale: "Milky stone wash; lower world strength and darken cards.",
};

const fullIntel = {
  iteration: 1,
  verdicts: [verdict],
  appliedOverrides: [{ worldStrength: 0.085, cardDarkness: 0.3 }],
  bestScore: 3,
  bestOverrides: { worldStrength: 0.085, cardDarkness: 0.3 },
  decision: "freeze-best",
  reason: "G4 stop-on-no-improvement.",
  guardrailHits: ["no_improvement"],
  cost: { visionCalls: 2, previewRenders: 2, finalRenders: 1 },
  operatorAction: { action: "accept", userId: "u-1", at: "2026-06-11T05:00:00.000Z" },
  finalJobId: "job-final-9",
};

beforeEach(() => {
  jobMock.findMany.mockReset();
});

describe("loadBatchIntel — DB-only projection (INTEL-05)", () => {
  it("queries ONLY the batch's intelligence jobs (intelState NOT null)", async () => {
    jobMock.findMany.mockResolvedValueOnce([]);
    await loadBatchIntel("batch-1");
    const arg = jobMock.findMany.mock.calls[0][0];
    expect(arg.where.batchId).toBe("batch-1");
    expect(arg.where.intelState).toEqual({ not: null });
  });

  it("projects scores/flags/deltas/rationale/decision/operatorAction from Job.intel", async () => {
    jobMock.findMany.mockResolvedValueOnce([
      {
        id: "job-1",
        intelState: "FINAL_QUEUED",
        intel: fullIntel,
        combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" },
        result: { image_blob: { pathname: "outputs/b1/job-1.png" } },
      },
    ]);
    const [view] = await loadBatchIntel("batch-1");
    expect(view.jobId).toBe("job-1");
    expect(view.intelState).toBe("FINAL_QUEUED");
    expect(view.iteration).toBe(1);
    expect(view.latestVerdict?.scores.diamondBrilliance).toBe(2);
    expect(view.latestVerdict?.flags.milky).toBe(true);
    expect(view.latestVerdict?.adjust.worldStrengthDelta).toBe(-0.02);
    expect(view.latestVerdict?.rationale).toMatch(/Milky stone wash/);
    expect(view.decision).toBe("freeze-best");
    expect(view.appliedOverrides).toEqual(fullIntel.appliedOverrides);
    expect(view.bestOverrides).toEqual(fullIntel.bestOverrides);
    expect(view.cost).toEqual(fullIntel.cost);
    expect(view.operatorAction).toEqual(fullIntel.operatorAction);
    expect(view.finalJobId).toBe("job-final-9");
    // Thumbnail flows through the auth-gated file proxy — never a public URL.
    expect(view.previewThumbUrl).toBe(
      `/api/file?pathname=${encodeURIComponent("outputs/b1/job-1.png")}`,
    );
    // Combo renders as the mono label.
    expect(view.comboLabel).toBe("hero · white · diamond · stone");
    // Not escalated — no escalateReason.
    expect(view.escalateReason).toBeNull();
  });

  it("tolerates a NULL intel Json without throwing (defaults)", async () => {
    jobMock.findMany.mockResolvedValueOnce([
      { id: "job-2", intelState: "PREVIEW_QUEUED", intel: null, combo: null, result: null },
    ]);
    const [view] = await loadBatchIntel("batch-1");
    expect(view.iteration).toBe(0);
    expect(view.verdicts).toEqual([]);
    expect(view.latestVerdict).toBeNull();
    expect(view.decision).toBeNull();
    expect(view.operatorAction).toBeNull();
    expect(view.previewThumbUrl).toBeNull();
    expect(view.cost).toEqual({ visionCalls: 0, previewRenders: 0, finalRenders: 0 });
  });

  it("tolerates a PARTIAL intel Json and surfaces escalateReason on ESCALATED", async () => {
    jobMock.findMany.mockResolvedValueOnce([
      {
        id: "job-3",
        intelState: "ESCALATED",
        intel: { iteration: 2, reason: "broken holdout — grouping/token issue" },
        combo: { angleKey: "top", metalKey: "rose", pass: "metal" },
        result: {},
      },
    ]);
    const [view] = await loadBatchIntel("batch-1");
    expect(view.iteration).toBe(2);
    expect(view.escalateReason).toMatch(/broken holdout/);
    expect(view.latestVerdict).toBeNull();
    expect(view.previewThumbUrl).toBeNull();
  });
});

describe("pure view helpers (presentational logic)", () => {
  it("scoreTone colors by floor: >=4 success, ==3 warning, <=2 destructive", () => {
    expect(scoreTone(5)).toBe("success");
    expect(scoreTone(4)).toBe("success");
    expect(scoreTone(3)).toBe("warning");
    expect(scoreTone(2)).toBe("destructive");
    expect(scoreTone(1)).toBe("destructive");
  });

  it("activeFlags lists ONLY the raised flags with operator labels", () => {
    expect(activeFlags(verdict.flags)).toEqual(["milky"]);
    expect(activeFlags(null)).toEqual([]);
    expect(
      activeFlags({
        milky: false,
        wrongMetal: true,
        brokenHoldout: true,
        blownHighlights: false,
        emptyOrBroken: false,
      }),
    ).toEqual(["wrong metal", "broken holdout"]);
  });

  it("proposedDeltaEntries skips zero deltas and signs the rest (mono numerics)", () => {
    const entries = proposedDeltaEntries(verdict.adjust);
    expect(entries).toEqual([
      { label: "world", value: "-0.02" },
      { label: "cards", value: "+0.2" },
    ]);
    expect(formatSignedDelta(0)).toBe("0");
    expect(formatSignedDelta(0.05)).toBe("+0.05");
    expect(formatSignedDelta(-1)).toBe("-1");
  });

  it("appliedOverrideEntries renders absolute knob values (incl. cameraPreset)", () => {
    const entries = appliedOverrideEntries({
      worldStrength: 0.085,
      cardDarkness: 0.3,
      cameraPreset: "front",
    });
    expect(entries).toEqual([
      { label: "world", value: "0.085" },
      { label: "cards", value: "0.3" },
      { label: "camera", value: "front" },
    ]);
    expect(appliedOverrideEntries(null)).toEqual([]);
  });

  it("overridesForIteration: 0 = seed ({}), k>=1 indexes appliedOverrides, OOB = null", () => {
    const intel = { appliedOverrides: [{ worldStrength: 0.08 }] };
    expect(overridesForIteration(intel, 0)).toEqual({});
    expect(overridesForIteration(intel, 1)).toEqual({ worldStrength: 0.08 });
    expect(overridesForIteration(intel, 2)).toBeNull();
    expect(overridesForIteration(intel, -1)).toBeNull();
    expect(overrideIterationOptions(intel)).toEqual([0, 1]);
  });

  it("isReviewable: ESCALATED/FINAL_QUEUED/DONE are reviewable; in-flight states are not", () => {
    expect(isReviewable("ESCALATED")).toBe(true);
    expect(isReviewable("FINAL_QUEUED")).toBe(true);
    expect(isReviewable("DONE")).toBe(true);
    expect(isReviewable("PREVIEW_QUEUED")).toBe(false);
    expect(isReviewable("ANALYZING")).toBe(false);
    expect(isReviewable("ANALYZING_IN_PROGRESS")).toBe(false);
    expect(isReviewable("ADJUSTED")).toBe(false);
  });
});
