import { describe, expect, it, vi, beforeEach } from "vitest";

// SEC-02 blob-guard: prove the upload-token route refuses to mint a token for an
// unauthenticated caller, and that the private-blob proxy denies unauth callers
// and serves only via get(pathname,{access:'private'}). Auth + blob are mocked so
// the suite runs with no network and no live session.

// --- requireSession mock: the single auth boundary both routes share. ---------
const requireSession = vi.fn();
vi.mock("@/lib/auth/rbac", () => ({ requireSession: () => requireSession() }));

// --- @vercel/blob mock: capture get()/put() calls, return controllable shapes. -
const getMock = vi.fn();
const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  get: (...a: unknown[]) => getMock(...a),
  put: (...a: unknown[]) => putMock(...a),
}));

// --- @vercel/blob/client mock: drive handleUpload's onBeforeGenerateToken so we
//     can assert requireSession() runs *before* any token config is produced. ---
let capturedOnBeforeGenerateToken:
  | ((pathname: string) => Promise<unknown>)
  | undefined;
vi.mock("@vercel/blob/client", () => ({
  handleUpload: async ({
    onBeforeGenerateToken,
  }: {
    onBeforeGenerateToken: (pathname: string) => Promise<unknown>;
  }) => {
    capturedOnBeforeGenerateToken = onBeforeGenerateToken;
    // Emulate the real handleUpload contract: invoke the hook; if it throws a
    // Response (the 401 auth case), let it propagate to the route's catch.
    return onBeforeGenerateToken("upload/model.glb");
  },
}));

beforeEach(() => {
  requireSession.mockReset();
  getMock.mockReset();
  putMock.mockReset();
  capturedOnBeforeGenerateToken = undefined;
});

describe("upload-token route (SEC-02 — onBeforeGenerateToken guard)", () => {
  it("rejects an unauthenticated caller with 401 (no token issued)", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const { POST } = await import("@/app/api/blob/upload/route");

    const req = new Request("http://localhost/api/blob/upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
    // requireSession ran; no token config was returned to the caller.
    expect(requireSession).toHaveBeenCalledTimes(1);
  });

  it("invokes requireSession() BEFORE producing token config for an authed caller", async () => {
    const order: string[] = [];
    requireSession.mockImplementationOnce(async () => {
      order.push("auth");
      return { user: { id: "u1", role: "Operator" } };
    });
    const { POST } = await import("@/app/api/blob/upload/route");

    const req = new Request("http://localhost/api/blob/upload", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });
    await POST(req);

    // The hook was wired and auth ran inside it.
    expect(typeof capturedOnBeforeGenerateToken).toBe("function");
    expect(order).toEqual(["auth"]);
    expect(requireSession).toHaveBeenCalledTimes(1);
  });
});

describe("private-blob proxy /api/file (SEC-02 — auth next to get())", () => {
  it("denies an unauthenticated GET with 401 (and never calls get())", async () => {
    requireSession.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const { GET } = await import("@/app/api/file/route");

    const req = new Request("http://localhost/api/file?pathname=upload/model.glb");
    const res = await GET(req as never);

    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("400s when pathname is missing", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    const { GET } = await import("@/app/api/file/route");

    const req = new Request("http://localhost/api/file");
    const res = await GET(req as never);

    expect(res.status).toBe(400);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("streams a private blob via get(pathname,{access:'private'}) for an authed caller", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    getMock.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream(),
      headers: new Headers(),
      blob: { contentType: "model/gltf-binary", size: 10, pathname: "upload/model.glb" },
    });
    const { GET } = await import("@/app/api/file/route");

    const req = new Request("http://localhost/api/file?pathname=upload/model.glb");
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    expect(getMock).toHaveBeenCalledWith("upload/model.glb", { access: "private" });
    expect(res.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("404s when the private blob is not found (get() returns null)", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "u1", role: "Operator" } });
    getMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/file/route");

    const req = new Request("http://localhost/api/file?pathname=missing.glb");
    const res = await GET(req as never);

    expect(res.status).toBe(404);
  });
});
