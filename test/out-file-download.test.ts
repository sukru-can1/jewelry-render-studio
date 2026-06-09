// OUT-03 (RED scaffold) — the private-blob proxy /api/file must, when invoked with
// download=1&name=foo, attach a sanitized Content-Disposition header so a single
// layer downloads as a file. RED today: app/api/file/route.ts streams inline with
// no Content-Disposition; Plan 03 extends it. Unauth -> 401 already holds.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

const getMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => getMock(...a),
}));

beforeEach(() => {
  requireSession.mockReset();
  getMock.mockReset();
});

describe("/api/file single-layer download (OUT-03)", () => {
  it("denies an unauthenticated download with 401 (never calls get())", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const { GET } = await import("@/app/api/file/route");

    const req = new Request(
      "http://localhost/api/file?pathname=outputs/a.png&download=1&name=hero-white.png",
    );
    const res = await GET(req as never);

    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("attaches a sanitized Content-Disposition: attachment header on download=1", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    getMock.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream(),
      headers: new Headers(),
      blob: { contentType: "image/png", size: 10, pathname: "outputs/a.png" },
    });
    const { GET } = await import("@/app/api/file/route");

    // A hostile name carrying CR/LF/quotes must be stripped before it reaches the header.
    const req = new Request(
      'http://localhost/api/file?pathname=outputs/a.png&download=1&name=he"ro%0d%0a-white.png',
    );
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename=/);
    // No raw CR/LF/quote leaked into the header value (header-injection guard).
    expect(disposition).not.toMatch(/[\r\n"]/);
  });
});
