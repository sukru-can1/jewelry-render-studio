// PROD-01 / SEC-02 — the blob upload-token route must (1) reject unauthenticated
// callers with 401 before any token logic runs, and (2) mint access:'private'
// tokens (the load-bearing SEC-02 fix; previously omitted → public).
//
// Mirrors test/user-admin.test.ts mocking style. handleUpload is mocked so we can
// invoke the route's onBeforeGenerateToken and capture the returned token config.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

// requireSession is toggled per-test: authed (resolve) vs unauth (throw 401).
const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/rbac", () => ({
  requireSession: requireSessionMock,
  requireRole: vi.fn(),
}));

// Capture the config object the route passes to handleUpload so we can invoke
// onBeforeGenerateToken and assert its return shape (access:'private').
const handleUploadMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob/client", () => ({
  handleUpload: handleUploadMock,
}));

import { POST } from "@/app/api/blob/upload/route";

function uploadRequest(): Request {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requireSessionMock.mockReset();
  handleUploadMock.mockReset();
});

describe("POST /api/blob/upload", () => {
  it("returns 401 for an unauthenticated caller, minting no token", async () => {
    requireSessionMock.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    // Real handleUpload calls onBeforeGenerateToken; emulate that so the 401 surfaces.
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken("models/x.glb");
      return {};
    });

    const res = await POST(uploadRequest());
    expect(res.status).toBe(401);
  });

  it("mints an access:'private' token for an authenticated caller (SEC-02)", async () => {
    requireSessionMock.mockResolvedValue(fakeSession("Operator"));
    let capturedConfig: Record<string, unknown> | undefined;
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }) => {
      capturedConfig = await onBeforeGenerateToken("models/ring.glb");
      return { ok: true };
    });

    const res = await POST(uploadRequest());
    expect(res.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalled();
    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?.access).toBe("private");
  });
});
