// COMP-02 — re-flattening the same variant is idempotent: both flattens write to
// the SAME deterministic blob pathname with allowOverwrite:true (no second distinct
// write key, no DB Layer row). A second click is a no-op overwrite.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
const layerMock = vi.hoisted(() => ({ upsert: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { batch: batchMock, job: jobMock, layer: layerMock },
}));

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => getMock(...a),
  put: (...a: unknown[]) => putMock(...a),
}));

vi.mock("sharp", () => {
  const factory = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1920, channels: 4, hasAlpha: true }),
    stats: vi.fn().mockResolvedValue({ channels: [{}, {}, {}, { min: 0, max: 255, mean: 40 }], isOpaque: false }),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("png")),
  }));
  return { default: factory };
});

function blobStream() {
  return {
    statusCode: 200,
    blob: { contentType: "image/png" },
    stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } }),
  };
}

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue({ user: { id: "u1", role: "Operator" } });
  batchMock.findUnique.mockReset().mockResolvedValue({ id: "batch-1" });
  jobMock.findMany.mockReset().mockResolvedValue([
    { id: "jm", status: "completed", combo: { angleKey: "hero", metalKey: "white", pass: "metal" }, layers: [{ id: "lm", pass: "metal", url: "renders/jm/m.png", format: "png" }] },
    { id: "js", status: "completed", combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" }, layers: [{ id: "ls", pass: "stone", url: "renders/js/s.png", format: "png" }] },
  ]);
  layerMock.upsert.mockReset();
  layerMock.create.mockReset();
  getMock.mockReset().mockImplementation(async () => blobStream());
  putMock.mockReset().mockResolvedValue({ pathname: "renders/batch-1/deliverables/hero_white.png" });
});

async function postFlatten() {
  const { POST } = await import("@/app/(app)/batches/[id]/flatten/route");
  const req = new Request("http://localhost/batches/batch-1/flatten?angle=hero&metal=white", { method: "POST" });
  return POST(req as never, { params: Promise.resolve({ id: "batch-1" }) });
}

describe("flatten idempotency (COMP-02 — blob-only overwrite)", () => {
  it("both flattens write the SAME pathname with allowOverwrite:true", async () => {
    const r1 = await postFlatten();
    const r2 = await postFlatten();
    expect((await r1.json()).ok).toBe(true);
    expect((await r2.json()).ok).toBe(true);

    expect(putMock).toHaveBeenCalledTimes(2);
    const p1 = putMock.mock.calls[0][0];
    const p2 = putMock.mock.calls[1][0];
    expect(p1).toBe("renders/batch-1/deliverables/hero_white.png");
    expect(p2).toBe(p1); // same deterministic key — overwrite in place
    expect(putMock.mock.calls[0][2]).toMatchObject({ allowOverwrite: true, access: "private" });
    expect(putMock.mock.calls[1][2]).toMatchObject({ allowOverwrite: true, access: "private" });
  });

  it("persists NO DB Layer row for the deliverable (blob-only)", async () => {
    await postFlatten();
    expect(layerMock.upsert).not.toHaveBeenCalled();
    expect(layerMock.create).not.toHaveBeenCalled();
  });
});
