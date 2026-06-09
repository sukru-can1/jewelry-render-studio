// OUT-03 (RED scaffold) — the full-set zip route streams a batch's layers as a
// single application/zip download. RED today: the route
// app/(app)/batches/[id]/download/route.ts does not exist (Plan 03 creates it).
//
// Security contract:
//  - requireSession first (unauth -> 401);
//  - the batch is loaded by params.id (IDOR scope — no cross-batch leakage);
//  - each layer is read PRIVATELY via get(pathname,{access:"private"}) — never a
//    public/signed URL;
//  - Content-Type is application/zip.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

const batchMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const jobMock = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { batch: batchMock, job: jobMock },
}));

const getMock = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...a: unknown[]) => getMock(...a) }));

// archiver is mocked so the route's stream wiring can be asserted without a real zip.
vi.mock("archiver", () => ({
  default: () => ({
    on: vi.fn(),
    append: vi.fn(),
    finalize: vi.fn(),
    pipe: vi.fn(),
  }),
}));

beforeEach(() => {
  requireSession.mockReset();
  batchMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  getMock.mockReset();
});

describe("batch zip download route (OUT-03)", () => {
  it("denies an unauthenticated request with 401", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    // @ts-expect-error RED scaffold: the zip route is created in Plan 03.
    const { GET } = await import("@/app/(app)/batches/[id]/download/route");

    const req = new Request("http://localhost/batches/batch-1/download");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.status).toBe(401);
  });

  it("loads the batch by params.id and streams application/zip via private get()", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce({ id: "batch-1", productId: "p1" });
    jobMock.findMany.mockResolvedValueOnce([
      {
        id: "job-1",
        status: "completed",
        combo: { angleKey: "hero", metalKey: "white", pass: "metal" },
        layers: [{ id: "l1", pass: "metal", url: "outputs/a.png" }],
      },
    ]);
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream(),
      blob: { contentType: "image/png", pathname: "outputs/a.png" },
    });

    // @ts-expect-error RED scaffold: the zip route is created in Plan 03.
    const { GET } = await import("@/app/(app)/batches/[id]/download/route");
    const req = new Request("http://localhost/batches/batch-1/download");
    const res = await GET(req as never, { params: Promise.resolve({ id: "batch-1" }) });

    expect(res.headers.get("Content-Type")).toBe("application/zip");
    // IDOR scope: the batch was loaded by the route param.
    expect(batchMock.findUnique.mock.calls[0][0].where.id).toBe("batch-1");
    // Private delivery only — every blob read goes through access:"private".
    expect(getMock).toHaveBeenCalledWith("outputs/a.png", { access: "private" });
  });
});
