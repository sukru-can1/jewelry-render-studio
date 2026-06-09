// COMP-02 — the per-variant flatten route is pure wiring over the tested pure
// primitives. This drives the gate PASS / FAIL contract end-to-end with mocks:
//   - PASS  -> sharp composites, putPrivate called ONCE, 200 {ok:true, deliverable}
//   - FAIL  -> 200 {ok:false, warnings}, putPrivate NOT called (never a silent flatten)
//
// Auth, prisma, @vercel/blob and sharp are all mocked so the suite runs with no
// network, no DB and no native libvips decode.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { batch: batchMock, job: jobMock },
}));

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => getMock(...a),
  put: (...a: unknown[]) => putMock(...a),
}));

// Controllable sharp double: metadata()/stats() drive the gate; composite().png().toBuffer()
// produces the deliverable bytes. Per-call shapes are queued via __sharpQueue.
const sharpState = vi.hoisted(() => ({
  metadata: { width: 1920, height: 1920, channels: 4, hasAlpha: true, format: "png" },
  stats: { channels: [{}, {}, {}, { min: 0, max: 255, mean: 40 }], isOpaque: false },
}));
vi.mock("sharp", () => {
  const factory = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue(sharpState.metadata),
    stats: vi.fn().mockResolvedValue(sharpState.stats),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    flatten: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("composited-png-bytes")),
  }));
  return { default: factory };
});

function blobStream(bytes = "layer-bytes") {
  return {
    statusCode: 200,
    blob: { contentType: "image/png" },
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(bytes));
        c.close();
      },
    }),
  };
}

beforeEach(() => {
  requireSession.mockReset();
  batchMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  getMock.mockReset();
  putMock.mockReset();
  sharpState.metadata = { width: 1920, height: 1920, channels: 4, hasAlpha: true, format: "png" };
  sharpState.stats = { channels: [{}, {}, {}, { min: 0, max: 255, mean: 40 }], isOpaque: false };

  requireSession.mockResolvedValue({ user: { id: "u1", role: "Operator" } });
  batchMock.findUnique.mockResolvedValue({ id: "batch-1", productId: "p1" });
  jobMock.findMany.mockResolvedValue([
    {
      id: "job-m",
      status: "completed",
      combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
      layers: [{ id: "l-m", pass: "metal", url: "renders/job-m/metal.png", format: "png" }],
    },
    {
      id: "job-s",
      status: "completed",
      combo: { angleKey: "hero", metalKey: "white", pass: "stone", stoneGroup: "diamond" },
      layers: [{ id: "l-s", pass: "stone", url: "renders/job-s/stone.png", format: "png" }],
    },
  ]);
  // Fresh stream per call — a ReadableStream can only be consumed once.
  getMock.mockImplementation(async () => blobStream());
  putMock.mockResolvedValue({ pathname: "renders/batch-1/deliverables/hero_white.png" });
});

async function postFlatten(query = "?angle=hero&metal=white", id = "batch-1") {
  const { POST } = await import("@/app/(app)/batches/[id]/flatten/route");
  const req = new Request(`http://localhost/batches/${id}/flatten${query}`, { method: "POST" });
  return POST(req as never, { params: Promise.resolve({ id }) });
}

describe("flatten route — gate PASS/FAIL (COMP-02)", () => {
  it("gate PASS: composites and writes ONE deliverable, returns 200 ok:true", async () => {
    const res = await postFlatten();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deliverable.format).toBe("png");
    expect(body.deliverable.width).toBe(1920);
    // exactly one private write to the deterministic deliverable pathname.
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][0]).toBe("renders/batch-1/deliverables/hero_white.png");
    expect(putMock.mock.calls[0][2]).toMatchObject({ access: "private", allowOverwrite: true });
  });

  it("gate FAIL (dimension mismatch): 200 ok:false with warnings, NO blob write", async () => {
    // First metadata() call (base) = 1920²; second (overlay) = different dims.
    let call = 0;
    const sharpMod = (await import("sharp")).default as unknown as { mockImplementation: (f: unknown) => void };
    sharpMod.mockImplementation(() => ({
      metadata: vi.fn().mockImplementation(async () => {
        call += 1;
        return call === 1
          ? { width: 1920, height: 1920, channels: 4, hasAlpha: false }
          : { width: 1024, height: 768, channels: 4, hasAlpha: true };
      }),
      stats: vi.fn().mockResolvedValue({ channels: [{}, {}, {}, { min: 0, max: 255, mean: 40 }], isOpaque: false }),
      composite: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("x")),
    }));

    const res = await postFlatten();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.some((w: { code: string }) => w.code === "dimension-mismatch")).toBe(true);
    // never a silent flatten — nothing written.
    expect(putMock).not.toHaveBeenCalled();
  });

  it("404s when the requested variant is not present in the batch", async () => {
    const res = await postFlatten("?angle=top&metal=rose");
    expect(res.status).toBe(404);
    expect(putMock).not.toHaveBeenCalled();
  });
});
