// AUTH-05: the server boundary, not just the hidden nav. With an Operator
// session, EVERY admin route (GET/POST/PATCH) must return 403 and MUST NOT touch
// the database. This proves T-1-RBAC: the privilege boundary is enforced
// server-side regardless of UI gating.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

// requireRole mirrors the real lib/auth/rbac.ts: an Operator hitting an
// Admin-gated route throws a 403 Response (fail-closed). The real requireRole is
// unit-tested in require-role.test.ts; here we assert the routes honor it.
vi.mock("@/lib/auth/rbac", () => {
  const requireSession = vi.fn(async () => fakeSession("Operator"));
  const requireRole = vi.fn(async (role: "Admin" | "Operator") => {
    const session = fakeSession("Operator");
    if (role === "Admin" && session.user.role !== "Admin") {
      throw new Response("Forbidden", { status: 403 });
    }
    return session;
  });
  return { requireRole, requireSession };
});

const userMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: userMock },
}));

import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[id]/route";

beforeEach(() => {
  userMock.findMany.mockReset();
  userMock.findUnique.mockReset();
  userMock.create.mockReset();
  userMock.update.mockReset();
});

describe("Operator → 403 on every admin user route (AUTH-05)", () => {
  it("GET /api/admin/users → 403, no DB read", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
    expect(userMock.findMany).not.toHaveBeenCalled();
  });

  it("POST /api/admin/users → 403, no user created", async () => {
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: "x@y.z",
        password: "longenough",
        role: "Operator",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(userMock.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/users/[id] → 403, no update", async () => {
    const req = new Request("http://localhost/api/admin/users/u1", {
      method: "PATCH",
      body: JSON.stringify({ disabled: true }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(403);
    expect(userMock.update).not.toHaveBeenCalled();
  });
});
