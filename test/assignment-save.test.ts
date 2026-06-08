// PROD-03/04: saveAssignments + loadAssignments. Mocks the Prisma singleton and
// the RBAC boundary exactly like user-admin.test.ts / settings-edit.test.ts so the
// action runs without a live DB or session. Asserts:
//  - requireSession() runs first (fail-closed at the AUTH boundary).
//  - A valid groups payload runs a $transaction that deleteMany existing rows for
//    the product then createMany ONE row per NON-EMPTY group (empty groups skipped).
//  - PROD-04 shape: persisted objectTokens are object SIGNATURES (lowercased
//    name+material strings) — exactly the `contains` tokens Phase-3 holdout matches,
//    NEVER cuids/row ids.
//  - An invalid group key (not in the enum) → zod reject, NO write.
//  - status recompute covers BOTH branches: alloycolour>=1 + no stone-typed mesh
//    unassigned → 'ready'; otherwise → 'needs_groups'.
//  - loadAssignments returns the saved rows as a group→tokens map (round-trips).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Operator")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

// Per-model spies used both directly and via the $transaction array form.
const assignmentMock = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  findMany: vi.fn(),
}));
const productMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));
const inspectionMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));
const prismaMock = vi.hoisted(() => ({
  objectGroupAssignment: assignmentMock,
  product: productMock,
  inspection: inspectionMock,
  // $transaction(array) just resolves the prisma promises (deleteMany/createMany).
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAssignments, loadAssignments } from "@/lib/products/assignments";

// A small inventory: one metal mesh + one clearly-stone mesh (diamond). Used to
// drive the status recompute (a stone mesh left unassigned must NOT be 'ready').
// Shaped as raw inspect_materials output so parseInventory computes signatures
// "band_metal gold" and "center_diamond glass".
function inventory() {
  return {
    objects: [
      { name: "band_metal", type: "MESH", material_slots: ["Gold"] },
      { name: "center_diamond", type: "MESH", material_slots: ["Glass"] },
    ],
    materials: [],
  };
}

beforeEach(() => {
  assignmentMock.deleteMany.mockReset();
  assignmentMock.createMany.mockReset();
  assignmentMock.findMany.mockReset();
  productMock.findUnique.mockReset();
  productMock.update.mockReset();
  inspectionMock.findFirst.mockReset();
  prismaMock.$transaction.mockClear();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));

  // Default: a product whose latest inspection carries the two-mesh inventory.
  productMock.findUnique.mockResolvedValue({ id: "p1", status: "needs_groups" });
  inspectionMock.findFirst.mockResolvedValue({
    id: "insp1",
    status: "completed",
    inventory: inventory(),
  });
});

describe("saveAssignments (PROD-03/04)", () => {
  it("requireSession() first; deleteMany then createMany one row per NON-EMPTY group", async () => {
    const result = await saveAssignments("p1", {
      alloycolour: ["band_metal gold"],
      diamond: ["center_diamond glass"],
      stone2: [],
      stone3: [],
    });

    expect(requireSessionMock).toHaveBeenCalled();
    expect(result.ok).toBe(true);

    // delete-and-recreate per Pattern 5.
    expect(assignmentMock.deleteMany).toHaveBeenCalledTimes(1);
    expect(assignmentMock.deleteMany.mock.calls[0][0].where).toEqual({
      productId: "p1",
    });

    // One createMany with one row PER non-empty group (empty groups skipped).
    expect(assignmentMock.createMany).toHaveBeenCalledTimes(1);
    const rows = assignmentMock.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    const groups = rows.map((r: { group: string }) => r.group).sort();
    expect(groups).toEqual(["alloycolour", "diamond"]);
  });

  it("PROD-04 shape: objectTokens are SIGNATURES, never ids/cuids", async () => {
    await saveAssignments("p1", {
      alloycolour: ["band_metal gold"],
      diamond: ["center_diamond glass"],
      stone2: [],
      stone3: [],
    });

    const rows = assignmentMock.createMany.mock.calls[0][0].data as {
      group: string;
      objectTokens: string[];
    }[];
    const diamond = rows.find((r) => r.group === "diamond");
    expect(diamond?.objectTokens).toEqual(["center_diamond glass"]);
    // A signature is a lowercased name+material string, NOT a 25-char cuid.
    for (const row of rows) {
      for (const token of row.objectTokens) {
        expect(token).not.toMatch(/^c[a-z0-9]{24}$/);
      }
    }
  });

  it("rejects an invalid group key (not in the enum) → NO write", async () => {
    const result = await saveAssignments("p1", {
      // @ts-expect-error — intentionally invalid group key for the zod-reject path.
      notagroup: ["x"],
    });
    expect(result.ok).toBe(false);
    expect(assignmentMock.deleteMany).not.toHaveBeenCalled();
    expect(assignmentMock.createMany).not.toHaveBeenCalled();
  });

  it("recomputes status='ready' when alloycolour>=1 AND no stone mesh left unassigned", async () => {
    await saveAssignments("p1", {
      alloycolour: ["band_metal gold"],
      diamond: ["center_diamond glass"], // the stone mesh IS grouped
      stone2: [],
      stone3: [],
    });
    expect(productMock.update).toHaveBeenCalledTimes(1);
    expect(productMock.update.mock.calls[0][0].data.status).toBe("ready");
  });

  it("recomputes status='needs_groups' when a stone mesh is left unassigned", async () => {
    await saveAssignments("p1", {
      alloycolour: ["band_metal gold"],
      diamond: [], // center_diamond left unassigned
      stone2: [],
      stone3: [],
    });
    expect(productMock.update.mock.calls[0][0].data.status).toBe("needs_groups");
  });

  it("recomputes status='needs_groups' when alloycolour is empty", async () => {
    await saveAssignments("p1", {
      alloycolour: [],
      diamond: ["center_diamond glass"],
      stone2: [],
      stone3: [],
    });
    expect(productMock.update.mock.calls[0][0].data.status).toBe("needs_groups");
  });
});

describe("loadAssignments (PROD-03)", () => {
  it("returns the saved rows as a group→tokens map (round-trips a save)", async () => {
    assignmentMock.findMany.mockResolvedValue([
      { group: "alloycolour", objectTokens: ["band_metal gold"] },
      { group: "diamond", objectTokens: ["center_diamond glass"] },
    ]);

    const map = await loadAssignments("p1");
    expect(map).toEqual({
      alloycolour: ["band_metal gold"],
      diamond: ["center_diamond glass"],
    });
    expect(assignmentMock.findMany.mock.calls[0][0].where).toEqual({
      productId: "p1",
    });
  });
});
