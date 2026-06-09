// COMP-03 — the whole-batch deliverables zip. The download route gains a
// `?deliverables=1` mode that zips ONLY the batch's flattened deliverables (the
// renders/<batchId>/deliverables/ blobs), reading each PRIVATELY, lazily flattening
// up to a CAP of missing variants within the 60s budget, and noting any remainder.
//
// Security + budget contract under test:
//  - requireSession first (unauth -> 401, no get()/list());
//  - the batch is loaded by params.id (IDOR scope — deliverable pathnames are derived
//    from THIS batch's DB variants, never from caller input);
//  - every blob (existing deliverable OR a just-flattened one) is read/written PRIVATELY;
//  - Content-Type is application/zip;
//  - missing deliverables are flattened lazily but CAPPED (never an unbounded synchronous
//    flatten that overruns 60s) — beyond the cap, variants are skipped and noted.
//  - the default raw-layer path (no ?deliverables) is unchanged (regression guard).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deliverablePathname } from "@/lib/compositing/deliverable";

// A readable web stream that emits one tiny chunk and CLOSES — the lazy-flatten
// path Buffers each layer by iterating get().stream, so an unclosed stream would
// hang the route. A fresh stream is produced per call (a stream can be read once).
function tinyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    },
  });
}

const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { batch: batchMock, job: jobMock },
}));

const getMock = vi.fn();
const listMock = vi.fn();
const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => getMock(...a),
  list: (...a: unknown[]) => listMock(...a),
  put: (...a: unknown[]) => putMock(...a),
}));

// archiver 8 is ESM: the route imports the named `ZipArchive` class. Mock it so we
// can assert which entries get appended without building a real zip. Capture the
// names appended so the test can assert the zip holds only deliverables.
const appended = vi.hoisted(() => [] as string[]);
vi.mock("archiver", () => ({
  ZipArchive: class {
    on = vi.fn();
    append = vi.fn((_data: unknown, opts: { name: string }) => {
      appended.push(opts.name);
    });
    finalize = vi.fn();
    pipe = vi.fn();
  },
}));

// sharp is the native composite engine the lazy-flatten path drives (via
// lib/compositing/flatten.ts). Mock it so a missing deliverable can be flattened in
// the test without libvips. metadata()/stats() feed the gate; composite().png().toBuffer()
// returns deterministic bytes.
vi.mock("sharp", () => {
  const make = () => ({
    metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1920 }),
    stats: vi.fn().mockResolvedValue({
      channels: [{}, {}, {}, { max: 255, mean: 128 }],
      isOpaque: false,
    }),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("flattened")),
  });
  return { default: vi.fn(() => make()) };
});

beforeEach(() => {
  requireSession.mockReset();
  batchMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  getMock.mockReset();
  listMock.mockReset();
  putMock.mockReset();
  appended.length = 0;
});

// Build a completed job for one (angle, metal) variant: one metal base + one stone overlay.
function variantJob(angleKey: string, metalKey: string) {
  return {
    id: `job-${angleKey}-${metalKey}`,
    status: "completed",
    combo: { angleKey, metalKey, pass: "metal" },
    layers: [
      {
        id: `l-${angleKey}-${metalKey}-m`,
        pass: "metal",
        url: `renders/batch-1/${angleKey}_${metalKey}_metal.png`,
        format: "png",
      },
      {
        id: `l-${angleKey}-${metalKey}-s`,
        pass: "stone",
        url: `renders/batch-1/${angleKey}_${metalKey}_stone.png`,
        format: "png",
        combo: { stoneGroup: "diamond" },
      },
    ],
  };
}

describe("batch deliverables zip route (COMP-03 — ?deliverables=1)", () => {
  it("denies an unauthenticated request with 401 (no blob access)", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const { GET } = await import("@/app/(app)/batches/[id]/download/route");

    const req = new Request("http://localhost/batches/batch-1/download?deliverables=1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
    expect(listMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("loads the batch by params.id (IDOR scope) for the deliverables zip", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });
    jobMock.findMany.mockResolvedValueOnce([]);
    listMock.mockResolvedValueOnce({ blobs: [] });

    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download?deliverables=1");
    await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(batchMock.findUnique.mock.calls[0][0].where.id).toBe("batch-1");
  });

  it("zips ONLY existing deliverable blobs, read PRIVATELY, as application/zip", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });
    jobMock.findMany.mockResolvedValueOnce([variantJob("view1", "white")]);

    const deliverable = deliverablePathname("batch-1", "view1", "white");
    // Already flattened — present under the deliverables/ prefix.
    listMock.mockResolvedValueOnce({ blobs: [{ pathname: deliverable }] });
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/png", pathname: deliverable },
    });

    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download?deliverables=1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // The ONLY blob read was the deliverable, read PRIVATELY (never a raw layer here).
    expect(getMock).toHaveBeenCalledWith(deliverable, { access: "private" });
    expect(getMock).toHaveBeenCalledTimes(1);
    // No lazy flatten was needed (the deliverable already existed) → no put().
    expect(putMock).not.toHaveBeenCalled();
  });

  it("lazily flattens a MISSING deliverable (putPrivate) then zips it", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });
    jobMock.findMany.mockResolvedValueOnce([variantJob("view1", "white")]);

    // Nothing flattened yet — the deliverables/ prefix is empty.
    listMock.mockResolvedValueOnce({ blobs: [] });
    // Layer-byte fetches (metal + stone) + (after flatten) the deliverable read all
    // come back 200 with a tiny, CLOSED stream (fresh per call).
    getMock.mockImplementation(async () => ({
      statusCode: 200,
      stream: tinyStream(),
      blob: { contentType: "image/png" },
    }));
    putMock.mockResolvedValue({ pathname: deliverablePathname("batch-1", "view1", "white") });

    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download?deliverables=1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // The missing deliverable was flattened and persisted PRIVATELY.
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][2]).toMatchObject({ access: "private" });
    expect(putMock.mock.calls[0][0]).toBe(
      deliverablePathname("batch-1", "view1", "white"),
    );
  });

  it("CAPS lazy flattening — beyond the cap, extra missing variants are skipped + noted", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });

    // 20 unflattened variants — far more than the cap (8–12).
    const jobs = [];
    for (let i = 0; i < 20; i++) {
      jobs.push(variantJob(`view${i}`, "white"));
    }
    jobMock.findMany.mockResolvedValueOnce(jobs);
    listMock.mockResolvedValueOnce({ blobs: [] }); // none flattened yet

    getMock.mockImplementation(async () => ({
      statusCode: 200,
      stream: tinyStream(),
      blob: { contentType: "image/png" },
    }));
    putMock.mockResolvedValue({ pathname: "x" });

    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download?deliverables=1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // The cap bounds the number of synchronous flattens in one request (never 20).
    expect(putMock.mock.calls.length).toBeLessThanOrEqual(12);
    expect(putMock.mock.calls.length).toBeGreaterThanOrEqual(8);
    // The partial set is noted so the client can tell the operator to flatten the rest.
    expect(res.headers.get("X-Deliverables-Note")).toBeTruthy();
  });

  it("regression: the default (no ?deliverables) path still zips RAW layers", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });
    jobMock.findMany.mockResolvedValueOnce([
      {
        id: "job-1",
        status: "completed",
        combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
        layers: [{ id: "l1", pass: "metal", url: "outputs/a.png", format: "png" }],
      },
    ]);
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/png", pathname: "outputs/a.png" },
    });

    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // Raw-layer path reads the layer pathname privately — and never touches deliverables.
    expect(getMock).toHaveBeenCalledWith("outputs/a.png", { access: "private" });
    expect(listMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });
});
