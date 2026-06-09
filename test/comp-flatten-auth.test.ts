// COMP-02 — the flatten route's auth + IDOR boundary:
//   - unauth -> 401, and NO get()/NO prisma read happens (fail-closed, first line);
//   - authed but unknown batch id -> 404 (IDOR scope by params.id), no compositing.
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

vi.mock("sharp", () => ({ default: vi.fn() }));

beforeEach(() => {
  requireSession.mockReset();
  batchMock.findUnique.mockReset();
  jobMock.findMany.mockReset();
  getMock.mockReset();
  putMock.mockReset();
});

async function postFlatten(id = "batch-1", query = "?angle=hero&metal=white") {
  const { POST } = await import("@/app/(app)/batches/[id]/flatten/route");
  const req = new Request(`http://localhost/batches/${id}/flatten${query}`, { method: "POST" });
  return POST(req as never, { params: Promise.resolve({ id }) });
}

describe("flatten route auth + IDOR (COMP-02 / T-06-01, T-06-02)", () => {
  it("denies an unauthenticated POST with 401 — no get(), no prisma read", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await postFlatten();
    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
    expect(batchMock.findUnique).not.toHaveBeenCalled();
    expect(jobMock.findMany).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("404s an authed caller for an unknown batch id (IDOR scope by params.id)", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    batchMock.findUnique.mockResolvedValueOnce(null);
    const res = await postFlatten("ghost-batch");
    expect(res.status).toBe(404);
    // the batch was looked up by the route param.
    expect(batchMock.findUnique.mock.calls[0][0].where.id).toBe("ghost-batch");
    // never composited / wrote anything for a non-existent batch.
    expect(getMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });
});
