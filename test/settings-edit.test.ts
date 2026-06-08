// DATA-04 / AUTH-05: settings Server Actions happy/sad/forbidden paths. Mocks the
// Prisma singleton + the RBAC boundary exactly like user-admin.test.ts so the
// actions run without a live DB or session. Asserts:
//  - Admin + valid payload → calls the matching prisma upsert and returns { ok:true }
//    + revalidatePath('/admin/settings').
//  - Operator (requireRole('Admin') throws a 403 Response) → fails closed:
//    returns { ok:false, forbidden:true } and NO prisma write (the AUTH-05
//    server-boundary assertion — UI hiding is not the boundary).
//  - Invalid payload (focalMm<=0, fStop=40, bad hex) → { ok:false, issues } and NO
//    write, surfacing the exact UI-SPEC copy strings.
//  - saveStoneTypes adds a new row (upsert by key) AND removes omitted rows
//    (deleteMany of keys not in the payload) — round-trips the editable list.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

// Admin session by default (requireRole resolves). Individual tests override
// requireRole to throw a 403 Response for the fail-closed Operator case.
const requireRoleMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Admin")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireRole: requireRoleMock,
  requireSession: vi.fn(async () => fakeSession("Admin")),
}));

const cameraViewMock = vi.hoisted(() => ({ upsert: vi.fn() }));
const metalMock = vi.hoisted(() => ({ upsert: vi.fn() }));
const stoneTypeMock = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));
const qualityPresetMock = vi.hoisted(() => ({ upsert: vi.fn() }));

// $transaction receives a callback with a tx client; run it with the same mocks
// so the upsert/deleteMany calls land on the asserted spies.
const txClient = vi.hoisted(() => ({} as Record<string, unknown>));
const prismaMock = vi.hoisted(() => ({
  cameraView: { upsert: vi.fn() },
  metal: { upsert: vi.fn() },
  stoneType: { upsert: vi.fn(), deleteMany: vi.fn() },
  qualityPreset: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import {
  saveCameraViews,
  saveMetals,
  saveQualityPresets,
  saveStoneTypes,
} from "@/lib/settings/actions";

// Bind the tx client to the same per-model mocks so a $transaction(cb) executes
// against asserted spies, and a $transaction([...promises]) just resolves.
function wireTransaction() {
  Object.assign(txClient, {
    cameraView: cameraViewMock,
    metal: metalMock,
    stoneType: stoneTypeMock,
    qualityPreset: qualityPresetMock,
  });
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)(txClient);
    }
    // array form: resolve all the prisma promises
    return Promise.all(arg as Promise<unknown>[]);
  });
  // Bare-client (non-tx) form: actions may also call prisma.<model>.* directly.
  prismaMock.cameraView.upsert.mockImplementation((...a: unknown[]) =>
    cameraViewMock.upsert(...a),
  );
  prismaMock.metal.upsert.mockImplementation((...a: unknown[]) =>
    metalMock.upsert(...a),
  );
  prismaMock.stoneType.upsert.mockImplementation((...a: unknown[]) =>
    stoneTypeMock.upsert(...a),
  );
  prismaMock.stoneType.deleteMany.mockImplementation((...a: unknown[]) =>
    stoneTypeMock.deleteMany(...a),
  );
  prismaMock.qualityPreset.upsert.mockImplementation((...a: unknown[]) =>
    qualityPresetMock.upsert(...a),
  );
}

beforeEach(() => {
  cameraViewMock.upsert.mockReset();
  metalMock.upsert.mockReset();
  stoneTypeMock.upsert.mockReset();
  stoneTypeMock.deleteMany.mockReset();
  qualityPresetMock.upsert.mockReset();
  prismaMock.$transaction.mockReset();
  requireRoleMock.mockReset();
  requireRoleMock.mockResolvedValue(fakeSession("Admin"));
  vi.mocked(revalidatePath).mockClear();
  wireTransaction();
});

const validCameraViews = [
  {
    key: "view1",
    label: "Hero",
    azimuth: 30,
    elevation: 15,
    focalMm: 85,
    fStop: 4,
  },
];
const validMetals = [{ key: "white", label: "White gold", hex: "#C4C4C4" }];
const validQualityPresets = [
  { key: "preview", label: "Preview", samples: 64, width: 1920, height: 1920 },
];

describe("saveCameraViews (DATA-04)", () => {
  it("Admin + valid payload upserts each row and revalidates", async () => {
    const result = await saveCameraViews(validCameraViews);
    expect(result).toEqual({ ok: true });
    expect(cameraViewMock.upsert).toHaveBeenCalledTimes(1);
    const arg = cameraViewMock.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ key: "view1" });
    expect(arg.update.focalMm).toBe(85);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it("Operator (403) fails closed: { forbidden } and NO write", async () => {
    requireRoleMock.mockRejectedValue(new Response("Forbidden", { status: 403 }));
    const result = await saveCameraViews(validCameraViews);
    expect(result).toEqual({ ok: false, forbidden: true });
    expect(cameraViewMock.upsert).not.toHaveBeenCalled();
  });

  it("rejects focalMm<=0 with the UI-SPEC copy and NO write", async () => {
    const result = await saveCameraViews([
      { ...validCameraViews[0], focalMm: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false && "issues" in result) {
      expect(JSON.stringify(result.issues)).toContain(
        "Focal must be greater than 0.",
      );
    } else {
      throw new Error("expected issues");
    }
    expect(cameraViewMock.upsert).not.toHaveBeenCalled();
  });

  it("rejects fStop=40 (out of 0.7..32) with the UI-SPEC copy and NO write", async () => {
    const result = await saveCameraViews([
      { ...validCameraViews[0], fStop: 40 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false && "issues" in result) {
      expect(JSON.stringify(result.issues)).toContain(
        "Use an f-stop between 0.7 and 32.",
      );
    }
    expect(cameraViewMock.upsert).not.toHaveBeenCalled();
  });
});

describe("saveMetals (DATA-04)", () => {
  it("Admin + valid payload upserts metals", async () => {
    const result = await saveMetals(validMetals);
    expect(result).toEqual({ ok: true });
    expect(metalMock.upsert).toHaveBeenCalledTimes(1);
    expect(metalMock.upsert.mock.calls[0][0].where).toEqual({ key: "white" });
  });

  it("rejects a bad hex with the UI-SPEC copy and NO write", async () => {
    const result = await saveMetals([
      { key: "white", label: "White gold", hex: "xyz" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false && "issues" in result) {
      expect(JSON.stringify(result.issues)).toContain(
        "Use a 6-digit hex like #C9A227.",
      );
    }
    expect(metalMock.upsert).not.toHaveBeenCalled();
  });

  it("Operator (403) fails closed for metals", async () => {
    requireRoleMock.mockRejectedValue(new Response("Forbidden", { status: 403 }));
    const result = await saveMetals(validMetals);
    expect(result).toEqual({ ok: false, forbidden: true });
    expect(metalMock.upsert).not.toHaveBeenCalled();
  });
});

describe("saveQualityPresets (DATA-04)", () => {
  it("Admin + valid payload upserts presets", async () => {
    const result = await saveQualityPresets(validQualityPresets);
    expect(result).toEqual({ ok: true });
    expect(qualityPresetMock.upsert).toHaveBeenCalledTimes(1);
    expect(qualityPresetMock.upsert.mock.calls[0][0].update.samples).toBe(64);
  });

  it("rejects non-positive samples and does NOT write", async () => {
    const result = await saveQualityPresets([
      { ...validQualityPresets[0], samples: 0 },
    ]);
    expect(result.ok).toBe(false);
    expect(qualityPresetMock.upsert).not.toHaveBeenCalled();
  });
});

describe("saveStoneTypes (DATA-04 — add/remove round-trip)", () => {
  it("upserts present keys AND deletes omitted keys", async () => {
    const result = await saveStoneTypes([
      { key: "diamond", label: "Diamond" },
      { key: "ruby", label: "Ruby" },
    ]);
    expect(result).toEqual({ ok: true });

    // Both provided rows upserted.
    expect(stoneTypeMock.upsert).toHaveBeenCalledTimes(2);
    const upsertedKeys = stoneTypeMock.upsert.mock.calls.map(
      (c) => c[0].where.key,
    );
    expect(upsertedKeys).toEqual(expect.arrayContaining(["diamond", "ruby"]));

    // deleteMany targets keys NOT in the payload (notIn the present keys).
    expect(stoneTypeMock.deleteMany).toHaveBeenCalledTimes(1);
    const where = stoneTypeMock.deleteMany.mock.calls[0][0].where;
    expect(where.key.notIn).toEqual(
      expect.arrayContaining(["diamond", "ruby"]),
    );
  });

  it("Operator (403) fails closed: no upsert, no delete", async () => {
    requireRoleMock.mockRejectedValue(new Response("Forbidden", { status: 403 }));
    const result = await saveStoneTypes([{ key: "diamond", label: "Diamond" }]);
    expect(result).toEqual({ ok: false, forbidden: true });
    expect(stoneTypeMock.upsert).not.toHaveBeenCalled();
    expect(stoneTypeMock.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a row with an empty key/label and does NOT write", async () => {
    const result = await saveStoneTypes([{ key: "", label: "" }]);
    expect(result.ok).toBe(false);
    expect(stoneTypeMock.upsert).not.toHaveBeenCalled();
    expect(stoneTypeMock.deleteMany).not.toHaveBeenCalled();
  });
});
