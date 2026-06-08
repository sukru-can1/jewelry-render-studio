// PROD-01: createProduct Server Action happy/sad paths. Mocks the Prisma
// singleton and the RBAC boundary exactly like user-admin.test.ts so the action
// runs without a live DB or session. Asserts: a zod-valid payload persists with
// modelUrl===modelPathname, modelFormat, and status='needs_inspection'; an
// invalid payload returns { ok:false, issues } WITHOUT touching prisma; an
// unauthenticated call (requireSession throws 401) fails closed.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

// Authenticated session by default (requireSession resolves). Individual tests
// override requireSession to throw for the fail-closed case.
const requireSessionMock = vi.hoisted(() =>
  vi.fn(async () => fakeSession("Operator")),
);
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(async () => fakeSession("Admin")),
}));

const productMock = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { product: productMock },
}));

// revalidatePath is a Next server-only API; stub it so the action imports cleanly.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createProduct } from "@/lib/products/actions";

beforeEach(() => {
  productMock.create.mockReset();
  requireSessionMock.mockReset();
  requireSessionMock.mockResolvedValue(fakeSession("Operator"));
});

describe("createProduct (PROD-01)", () => {
  it("persists a valid product with status='needs_inspection' and modelUrl===modelPathname", async () => {
    productMock.create.mockResolvedValue({ id: "p1" });

    const result = await createProduct({
      name: "Solitaire Ring 99",
      modelPathname: "models/ring99-abc123.glb",
      modelFormat: "glb",
    });

    expect(result).toEqual({ ok: true, id: "p1" });

    expect(productMock.create).toHaveBeenCalledTimes(1);
    const data = productMock.create.mock.calls[0][0].data;
    expect(data.name).toBe("Solitaire Ring 99");
    expect(data.modelUrl).toBe("models/ring99-abc123.glb");
    expect(data.modelFormat).toBe("glb");
    expect(data.status).toBe("needs_inspection");
  });

  it("never stores the public url — only the pathname", async () => {
    productMock.create.mockResolvedValue({ id: "p2" });

    await createProduct({
      name: "Ring",
      modelPathname: "models/ring.glb",
      modelFormat: "glb",
    });

    const data = productMock.create.mock.calls[0][0].data;
    // The action must persist the pathname, not a full https URL.
    expect(data.modelUrl).not.toMatch(/^https?:\/\//);
    expect(data).not.toHaveProperty("url");
  });

  it("rejects an empty name with { ok:false, issues } and does NOT call prisma", async () => {
    const result = await createProduct({
      name: "",
      modelPathname: "models/ring.glb",
      modelFormat: "glb",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.issues).toBeTruthy();
    }
    expect(productMock.create).not.toHaveBeenCalled();
  });

  it("rejects a disallowed model format with { ok:false } and does NOT call prisma", async () => {
    const result = await createProduct({
      name: "Ring",
      modelPathname: "models/ring.png",
      modelFormat: "png",
    });

    expect(result.ok).toBe(false);
    expect(productMock.create).not.toHaveBeenCalled();
  });

  it("fails closed when unauthenticated (requireSession throws) and does NOT call prisma", async () => {
    requireSessionMock.mockRejectedValue(new Response("Unauthorized", { status: 401 }));

    await expect(
      createProduct({
        name: "Ring",
        modelPathname: "models/ring.glb",
        modelFormat: "glb",
      }),
    ).rejects.toBeInstanceOf(Response);

    expect(productMock.create).not.toHaveBeenCalled();
  });
});
