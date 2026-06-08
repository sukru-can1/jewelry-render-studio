// BATCH-07 — End-to-end happy-path scaffold for the whole batch slice.
//
// RED until 03-02 implements createBatch. This test MUST fail at import-resolution
// now because `@/lib/batches/actions` does not exist yet — that is the expected,
// documented RED state recorded in the SUMMARY. When 03-02 lands `createBatch`,
// this turns GREEN with no edits.
//
// Mocks mirror the harness in test/assignment-save.test.ts: the RBAC boundary
// (requireSession -> Operator), the Prisma singleton (batch.create, job.createMany,
// product.findUnique, $transaction passthrough), and next/cache.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Operator")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

const batchMock = vi.hoisted(() => ({
  create: vi.fn(),
}));
const jobMock = vi.hoisted(() => ({
  createMany: vi.fn(),
}));
const productMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));
const prismaMock = vi.hoisted(() => ({
  batch: batchMock,
  job: jobMock,
  product: productMock,
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// RED until 03-02 implements createBatch — this import currently fails to resolve.
// The @ts-expect-error keeps `tsc --noEmit` green (the module is a planned 03-02
// artifact) while the test still fails at RUNTIME import-resolution under vitest —
// that runtime failure is the documented Wave-0 RED state. The directive itself
// becomes unused (and will error) the moment 03-02 lands the module, prompting its
// removal.
// @ts-expect-error -- @/lib/batches/actions is implemented in 03-02 (documented RED).
import { createBatch } from "@/lib/batches/actions";

beforeEach(() => {
  batchMock.create.mockReset();
  jobMock.createMany.mockReset();
  productMock.findUnique.mockReset();
  prismaMock.$transaction.mockClear();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));

  // A product with the metal + diamond groups assigned, and a saved inventory.
  productMock.findUnique.mockResolvedValue({
    id: "p1",
    status: "ready",
    assignments: [
      { group: "alloycolour", objectTokens: ["band_metal gold"] },
      { group: "diamond", objectTokens: ["center_diamond glass"] },
    ],
  });
  batchMock.create.mockResolvedValue({ id: "b1", jobCount: 4 });
  jobMock.createMany.mockResolvedValue({ count: 4 });
});

describe("createBatch (BATCH-07 happy path)", () => {
  it("creates a Batch and N queued Job rows for a small valid selection", async () => {
    // 2 angles × 1 metal × 2 passes (metal + diamond) = 4 jobs.
    const result = await createBatch({
      productId: "p1",
      angleViewKeys: ["view1", "view2"],
      metalKeys: ["white"],
      stoneTypeByGroup: { diamond: "diamond" },
      passes: ["metal", "diamond"],
      qualityKey: "preview",
    });

    expect(requireSessionMock).toHaveBeenCalled();
    expect(batchMock.create).toHaveBeenCalledTimes(1);

    expect(jobMock.createMany).toHaveBeenCalledTimes(1);
    const rows = jobMock.createMany.mock.calls[0][0].data as Array<{
      status: string;
    }>;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.status).toBe("queued");
    }

    expect(result).toBeTruthy();
  });
});
