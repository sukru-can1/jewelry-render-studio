// PROD-02 — startInspection + pollInspection Server Actions.
// Mocks @/lib/runpod (submit/status), @/lib/db/prisma (product + inspection),
// @/lib/blob (workerModelUrl), @/lib/auth/rbac (requireSession), @vercel/blob
// (private get of the inventory sidecar), and next/cache (revalidatePath).
//
// The two ids are explicitly distinct: input.job_id is an app-minted WORKER key
// (drives the sidecar pathname), while the persisted runpodJobId === submitRunPod().id
// (drives getRunPodStatus polling). The COMPLETED path reads the sidecar PRIVATELY
// by pathname (inventory_key) via @vercel/blob get(..., { access:'private' }) and
// NEVER fetches the public inventory_url (SEC-02).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryFixture } from "./factories";
import { fakeSession } from "./setup";

vi.mock("@/lib/auth/rbac", () => ({
  requireSession: vi.fn(async () => fakeSession("Operator")),
  requireRole: vi.fn(async () => fakeSession("Operator")),
}));

const submitRunPod = vi.hoisted(() => vi.fn());
const getRunPodStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runpod", () => ({ submitRunPod, getRunPodStatus }));

const workerModelUrl = vi.hoisted(() => vi.fn(async () => "https://worker-readable.example/signed-get"));
vi.mock("@/lib/blob", () => ({ workerModelUrl }));

// @vercel/blob get() — private sidecar read. Returns the 200 discriminated-union
// shape: { statusCode: 200, stream } where stream is the JSON body.
const blobGet = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ get: blobGet }));

const productMock = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
const inspectionMock = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { product: productMock, inspection: inspectionMock },
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { pollInspection, startInspection } from "@/lib/products/inspection";

function streamOf(json: unknown): { statusCode: 200; stream: ReadableStream<Uint8Array> } {
  return {
    statusCode: 200,
    stream: new Response(JSON.stringify(json)).body as ReadableStream<Uint8Array>,
  };
}

beforeEach(() => {
  submitRunPod.mockReset();
  getRunPodStatus.mockReset();
  workerModelUrl.mockReset();
  workerModelUrl.mockResolvedValue("https://worker-readable.example/signed-get");
  blobGet.mockReset();
  productMock.findUnique.mockReset();
  productMock.update.mockReset();
  inspectionMock.create.mockReset();
  inspectionMock.findUnique.mockReset();
  inspectionMock.update.mockReset();
  revalidatePath.mockReset();
});

describe("startInspection", () => {
  it("dispatches inspect_materials with a worker-readable URL, an app worker key, and inspections/<id> prefix", async () => {
    productMock.findUnique.mockResolvedValue({
      id: "prod-1",
      modelUrl: "models/ring99.glb",
      status: "needs_inspection",
    });
    submitRunPod.mockResolvedValue({ id: "runpod-job-xyz" });
    inspectionMock.create.mockResolvedValue({ id: "insp-1" });

    const res = await startInspection("prod-1");
    expect(res.ok).toBe(true);

    // workerModelUrl minted from the stored pathname.
    expect(workerModelUrl).toHaveBeenCalledWith("models/ring99.glb");

    const input = submitRunPod.mock.calls[0][0] as Record<string, unknown>;
    expect(input.operation).toBe("inspect_materials");
    expect(input.output).toEqual({ prefix: "inspections/prod-1" });
    const model = input.model as Record<string, unknown>;
    expect(model.url).toBe("https://worker-readable.example/signed-get");
    expect(model.pathname).toBe("models/ring99.glb");
    expect(typeof input.job_id).toBe("string");
    expect((input.job_id as string).length).toBeGreaterThan(0);
  });

  it("persists runpodJobId === submitRunPod().id, DISTINCT from the worker job_id", async () => {
    productMock.findUnique.mockResolvedValue({
      id: "prod-1",
      modelUrl: "models/ring99.glb",
      status: "needs_inspection",
    });
    submitRunPod.mockResolvedValue({ id: "runpod-job-xyz" });
    inspectionMock.create.mockResolvedValue({ id: "insp-1" });

    await startInspection("prod-1");

    const input = submitRunPod.mock.calls[0][0] as Record<string, unknown>;
    const created = inspectionMock.create.mock.calls[0][0].data;
    // id split: the worker key is NOT the RunPod id; the row stores the RunPod id.
    expect(input.job_id).not.toBe("runpod-job-xyz");
    expect(created.runpodJobId).toBe("runpod-job-xyz");
    expect(created.status).toBe("in_queue");
    expect(created.productId).toBe("prod-1");
  });

  it("sets product.status 'inspecting' and revalidates the product path", async () => {
    productMock.findUnique.mockResolvedValue({
      id: "prod-1",
      modelUrl: "models/ring99.glb",
      status: "needs_inspection",
    });
    submitRunPod.mockResolvedValue({ id: "runpod-job-xyz" });
    inspectionMock.create.mockResolvedValue({ id: "insp-1" });

    await startInspection("prod-1");

    expect(productMock.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { status: "inspecting" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/products/prod-1");
  });

  it("a product with no modelUrl returns { ok:false } without dispatching", async () => {
    productMock.findUnique.mockResolvedValue({
      id: "prod-1",
      modelUrl: null,
      status: "needs_inspection",
    });

    const res = await startInspection("prod-1");
    expect(res.ok).toBe(false);
    expect(submitRunPod).not.toHaveBeenCalled();
    expect(inspectionMock.create).not.toHaveBeenCalled();
  });
});

describe("pollInspection", () => {
  function inspectionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "insp-1",
      productId: "prod-1",
      runpodJobId: "runpod-job-xyz",
      status: "in_queue",
      ...overrides,
    };
  }

  it("COMPLETED → reads the sidecar PRIVATELY by pathname, parses, persists completed + inventory", async () => {
    inspectionMock.findUnique.mockResolvedValue(inspectionRow());
    inspectionMock.update.mockResolvedValue(inspectionRow({ status: "completed" }));
    getRunPodStatus.mockResolvedValue({
      status: "COMPLETED",
      output: {
        job_id: "worker-key-abc",
        inventory_key: "inspections/prod-1/worker-key-abc_material_inventory.json",
        inventory_url: "https://public.example/should-not-be-fetched.json",
      },
    });
    blobGet.mockResolvedValue(streamOf(inventoryFixture()));

    await pollInspection("insp-1");

    // Private read by PATHNAME (inventory_key), access:'private'.
    expect(blobGet).toHaveBeenCalledWith(
      "inspections/prod-1/worker-key-abc_material_inventory.json",
      { access: "private" },
    );
    // The public inventory_url must NOT be fetched.
    const fetchSpy = globalThis.fetch as unknown as { mock?: { calls: unknown[][] } };
    if (fetchSpy?.mock) {
      const fetchedPublic = fetchSpy.mock.calls.some(
        (c) => String(c[0]).includes("should-not-be-fetched"),
      );
      expect(fetchedPublic).toBe(false);
    }

    const updated = inspectionMock.update.mock.calls[0][0];
    expect(updated.where).toEqual({ id: "insp-1" });
    expect(updated.data.status).toBe("completed");
    expect(updated.data.finishedAt).toBeInstanceOf(Date);
    // parseInventory ran (MESH-only: 2 of 3 fixture objects).
    expect(updated.data.inventory.objects).toHaveLength(2);
    expect(updated.data.inventory.objects[0].name).toBe("band_metal");

    expect(productMock.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { status: "needs_groups" },
    });
  });

  it("FAILED → records status 'failed' + truncated error and product.status 'inspection_failed'", async () => {
    inspectionMock.findUnique.mockResolvedValue(inspectionRow());
    inspectionMock.update.mockResolvedValue(inspectionRow({ status: "failed" }));
    getRunPodStatus.mockResolvedValue({
      status: "FAILED",
      output: { error: "Blender material inspection failed" },
    });

    await pollInspection("insp-1");

    const updated = inspectionMock.update.mock.calls[0][0];
    expect(updated.data.status).toBe("failed");
    expect(updated.data.error).toContain("Blender material inspection failed");
    expect(blobGet).not.toHaveBeenCalled();
    expect(productMock.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { status: "inspection_failed" },
    });
  });

  it("IN_QUEUE / IN_PROGRESS → updates status only, no inventory write", async () => {
    inspectionMock.findUnique.mockResolvedValue(inspectionRow());
    inspectionMock.update.mockResolvedValue(inspectionRow({ status: "in_progress" }));
    getRunPodStatus.mockResolvedValue({ status: "IN_PROGRESS" });

    await pollInspection("insp-1");

    const updated = inspectionMock.update.mock.calls[0][0];
    expect(updated.data.status).toBe("in_progress");
    expect(updated.data).not.toHaveProperty("inventory");
    expect(blobGet).not.toHaveBeenCalled();
    // Product status not touched on a still-running poll.
    expect(productMock.update).not.toHaveBeenCalled();
  });
});
