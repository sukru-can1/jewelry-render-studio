// BATCH-06/07 + security — createBatch Server Action.
//
// Mirrors test/assignment-save.test.ts: mock the RBAC boundary (requireSession ->
// Operator), the Prisma singleton (batch.create, job.createMany, product.findUnique,
// objectGroupAssignment.findMany, qualityPreset.findFirst, $transaction passthrough),
// and next/cache. Asserts the full security + cap + atomicity contract:
//  - requireSession() is called (fail-closed at the AUTH boundary).
//  - invalid payload -> { ok:false } with NO product read and NO write.
//  - missing OR not-ready product -> { ok:false } with NO write (IDOR / readiness).
//  - unsupported StoneType.key -> { ok:false } with NO write.
//  - server recomputes jobCount and rejects > HARD_CAP BEFORE any write (201 boundary).
//  - happy path: ONE $transaction creating the Batch (status "queued") + N queued Jobs.
//  - a throw inside the tx (createMany rejects) does NOT return ok:true (all-or-none).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BATCH_LIMITS } from "@/lib/batches/estimate";

import { fakeSession } from "./setup";

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Operator")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

// INTEL-04 (Phase 9): actions.ts now reads env for the G9 kill-switch. No key =>
// the intelligence branch is OFF, so every assertion below exercises the classic
// path exactly as before (and the suite needs no live env file).
vi.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: undefined, ADAPTIVE_INTELLIGENCE_ENABLED: undefined },
}));

const batchMock = vi.hoisted(() => ({ create: vi.fn() }));
const jobMock = vi.hoisted(() => ({ createMany: vi.fn() }));
const productMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const qualityMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const cameraViewMock = vi.hoisted(() => ({ findMany: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  batch: batchMock,
  job: jobMock,
  product: productMock,
  qualityPreset: qualityMock,
  cameraView: cameraViewMock,
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createBatch } from "@/lib/batches/actions";

// A ready product with alloycolour + diamond groups assigned (assignments embedded
// via the findUnique include, matching the 03-01 e2e harness contract).
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
function quality() {
  return { key: "preview", samples: 64, width: 1024, height: 1024 };
}

function validInput(over: Record<string, unknown> = {}) {
  return {
    productId: "p1",
    angleViewKeys: ["view1", "view2"],
    metalKeys: ["white"],
    stoneTypeByGroup: { diamond: "diamond" },
    passes: ["metal", "diamond"],
    qualityKey: "preview",
    ...over,
  };
}

beforeEach(() => {
  batchMock.create.mockReset();
  jobMock.createMany.mockReset();
  productMock.findUnique.mockReset();
  qualityMock.findFirst.mockReset();
  cameraViewMock.findMany.mockReset();
  prismaMock.$transaction.mockClear();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));

  productMock.findUnique.mockResolvedValue(readyProduct());
  qualityMock.findFirst.mockResolvedValue(quality());
  // Default: no configured views in the DB read -> the action falls back to the
  // selection keys (legacy positional behavior the older cases were written for).
  cameraViewMock.findMany.mockResolvedValue([]);
  batchMock.create.mockResolvedValue({ id: "b1", jobCount: 4 });
  jobMock.createMany.mockResolvedValue({ count: 4 });
});

describe("createBatch — security boundary", () => {
  it("calls requireSession (fail-closed)", async () => {
    await createBatch(validInput());
    expect(requireSessionMock).toHaveBeenCalled();
  });

  it("rejects an invalid payload with NO product read and NO write", async () => {
    const result = await createBatch({ productId: "p1" });
    expect(result.ok).toBe(false);
    expect(productMock.findUnique).not.toHaveBeenCalled();
    expect(batchMock.create).not.toHaveBeenCalled();
    expect(jobMock.createMany).not.toHaveBeenCalled();
  });

  it("rejects a missing product with NO write (IDOR)", async () => {
    productMock.findUnique.mockResolvedValue(null);
    const result = await createBatch(validInput());
    expect(result.ok).toBe(false);
    expect(batchMock.create).not.toHaveBeenCalled();
  });

  it("rejects a not-ready product with NO write (readiness guard)", async () => {
    productMock.findUnique.mockResolvedValue({ ...readyProduct(), status: "needs_groups" });
    const result = await createBatch(validInput());
    expect(result.ok).toBe(false);
    expect(batchMock.create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported StoneType.key with NO write", async () => {
    const result = await createBatch(
      validInput({ stoneTypeByGroup: { diamond: "unobtainium" } }),
    );
    expect(result.ok).toBe(false);
    expect(batchMock.create).not.toHaveBeenCalled();
  });
});

describe("createBatch — server cap (BATCH-06)", () => {
  // The cap is recomputed from the VALIDATED selection using the same formula as the
  // client estimate: |angleViewKeys| × |metalKeys| × passCount, where passCount now
  // INCLUDES the implicit full beauty pass (buildPasses always emits it first). A
  // product with two present stone groups lets passCount reach 4
  // (full+metal+diamond+stone2) so the 200 boundary is exercisable within the zod
  // array caps (angles<=50, valid metals<=3).
  function twoStoneProduct() {
    return {
      id: "p1",
      name: "Ring 99",
      status: "ready",
      assignments: [
        { group: "alloycolour", objectTokens: ["band_metal gold"] },
        { group: "diamond", objectTokens: ["center_diamond glass"] },
        { group: "stone2", objectTokens: ["accent stone2"] },
      ],
    };
  }
  const angles50 = Array.from({ length: 50 }, (_, i) => `view${i + 1}`);

  it("rejects > HARD_CAP recomputed server-side with NO write", async () => {
    // 50 angles × 2 metals × 4 passes (full+metal+diamond+stone2) = 400 > HARD_CAP (200).
    productMock.findUnique.mockResolvedValue(twoStoneProduct());
    const result = await createBatch(
      validInput({
        angleViewKeys: angles50,
        metalKeys: ["white", "yellow"],
        stoneTypeByGroup: { diamond: "diamond", stone2: "sapphire" },
        passes: ["metal", "diamond", "stone2"],
      }),
    );
    expect(result.ok).toBe(false);
    expect(batchMock.create).not.toHaveBeenCalled();
    expect(jobMock.createMany).not.toHaveBeenCalled();
  });

  it("counts the IMPLICIT full pass toward the cap (truthful cost guard)", async () => {
    // 34 angles × 2 metals × 3 passes (full+metal+diamond) = 204 > 200 — the raw
    // selection only names 2 passes, so a guard that ignored the implicit full
    // pass would WRONGLY accept this batch.
    productMock.findUnique.mockResolvedValue(twoStoneProduct());
    const result = await createBatch(
      validInput({
        angleViewKeys: Array.from({ length: 34 }, (_, i) => `view${i + 1}`),
        metalKeys: ["white", "yellow"],
        stoneTypeByGroup: { diamond: "diamond" },
        passes: ["metal", "diamond"],
      }),
    );
    expect(result.ok).toBe(false);
    expect(batchMock.create).not.toHaveBeenCalled();
  });

  it("accepts exactly HARD_CAP jobs (200 boundary, inclusive)", async () => {
    expect(BATCH_LIMITS.HARD_CAP).toBe(200);
    // 50 angles × 2 metals × 2 passes (implicit full + metal) = 200 == HARD_CAP.
    productMock.findUnique.mockResolvedValue(twoStoneProduct());
    const result = await createBatch(
      validInput({
        angleViewKeys: angles50,
        metalKeys: ["white", "yellow"],
        stoneTypeByGroup: { diamond: "diamond" },
        passes: ["metal"],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("createBatch — angle mapping uses ALL configured camera views (camera-mapping fix)", () => {
  const allFourViews = [
    { key: "view1" },
    { key: "view2" },
    { key: "view3" },
    { key: "view4" },
  ];

  it("a lone view4 selection maps to 'profile' (its position among ALL views), not 'hero'", async () => {
    cameraViewMock.findMany.mockResolvedValue(allFourViews);

    const result = await createBatch(
      validInput({ angleViewKeys: ["view4"], passes: ["metal"] }),
    );
    expect(result.ok).toBe(true);

    const rows = jobMock.createMany.mock.calls[0][0].data as Array<{
      combo: { angleKey?: string };
    }>;
    // 1 angle × 1 metal × 2 passes (implicit full + metal) = 2 rows, ALL profile.
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.combo.angleKey).toBe("profile");
    }
  });

  it("a partial selection keeps each view's canonical angle (view2 -> front, view3 -> top)", async () => {
    cameraViewMock.findMany.mockResolvedValue(allFourViews);

    const result = await createBatch(
      validInput({ angleViewKeys: ["view2", "view3"], passes: ["metal"] }),
    );
    expect(result.ok).toBe(true);

    const rows = jobMock.createMany.mock.calls[0][0].data as Array<{
      combo: { angleKey?: string };
    }>;
    const angles = new Set(rows.map((r) => r.combo.angleKey));
    expect(angles).toEqual(new Set(["front", "top"]));
  });

  it("falls back to the selection keys when the DB has no camera views (legacy behavior)", async () => {
    cameraViewMock.findMany.mockResolvedValue([]);

    const result = await createBatch(
      validInput({ angleViewKeys: ["view4"], passes: ["metal"] }),
    );
    expect(result.ok).toBe(true);

    const rows = jobMock.createMany.mock.calls[0][0].data as Array<{
      combo: { angleKey?: string };
    }>;
    // With only the selection as the universe, view4 sorts first -> hero.
    for (const row of rows) {
      expect(row.combo.angleKey).toBe("hero");
    }
  });
});

describe("createBatch — transactional fan-out (BATCH-07)", () => {
  it("creates Batch (queued) + N queued Jobs in ONE $transaction", async () => {
    const result = await createBatch(validInput());

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(batchMock.create).toHaveBeenCalledTimes(1);
    expect(batchMock.create.mock.calls[0][0].data.status).toBe("queued");
    // createdById captured from the session (audit provenance).
    expect(batchMock.create.mock.calls[0][0].data.createdById).toBe("test-operator-id");

    expect(jobMock.createMany).toHaveBeenCalledTimes(1);
    const rows = jobMock.createMany.mock.calls[0][0].data as Array<{
      status: string;
      combo: { pass?: string };
      recipe: unknown;
    }>;
    // 2 angles × 1 metal × 3 passes (implicit full + metal + diamond) = 6.
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.status).toBe("queued");
      expect(row.combo).toBeTruthy();
      expect(row.recipe).toBeTruthy();
    }
    // The primary full beauty pass is persisted on the combo for every angle×metal.
    expect(rows.filter((r) => r.combo.pass === "full")).toHaveLength(2);
    for (const row of rows) {
      expect((row.recipe as { master_scene?: { enabled?: boolean } }).master_scene?.enabled).toBe(true);
    }

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.batchId).toBe("b1");
      expect(result.jobCount).toBe(6);
    }
  });

  it("does NOT return ok:true when createMany rejects inside the tx (all-or-none)", async () => {
    jobMock.createMany.mockRejectedValue(new Error("write conflict"));
    await expect(createBatch(validInput())).rejects.toThrow();
    // The action surfaces the throw; no ok:true is returned.
  });
});
