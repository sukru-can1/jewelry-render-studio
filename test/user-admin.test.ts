// AUTH-04: Admin user CRUD happy paths. Mocks requireRole (session = Admin) and
// the Prisma singleton so the admin routes run without a live DB. Asserts: an
// Admin can create a user (bcrypt-hashed temp pw, zod-validated), list users
// (passwordHash NEVER returned), disable/enable a user, and change a user's
// role. bcrypt.compare proves the stored hash verifies the supplied password.
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminUser, operatorUser } from "./factories";
import { fakeSession } from "./setup";

// Admin session: requireRole("Admin") resolves (no throw).
vi.mock("@/lib/auth/rbac", () => ({
  requireRole: vi.fn(async () => fakeSession("Admin")),
  requireSession: vi.fn(async () => fakeSession("Admin")),
}));

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

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  userMock.findMany.mockReset();
  userMock.findUnique.mockReset();
  userMock.create.mockReset();
  userMock.update.mockReset();
});

describe("GET /api/admin/users (Admin)", () => {
  it("returns the user list without passwordHash", async () => {
    userMock.findMany.mockResolvedValue([
      {
        id: "u1",
        email: "a@b.c",
        role: "Operator",
        disabled: false,
        createdAt: new Date(),
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toHaveLength(1);
    expect(data.users[0]).not.toHaveProperty("passwordHash");

    // The select passed to Prisma must exclude passwordHash (T-1-DISCLOSE).
    const select = userMock.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("passwordHash");
    expect(select.email).toBe(true);
  });
});

describe("POST /api/admin/users (Admin create)", () => {
  it("creates a user with a bcrypt-hashed temp password and validated role", async () => {
    userMock.findUnique.mockResolvedValue(null);
    userMock.create.mockImplementation(async ({ data }: { data: { email: string; passwordHash: string; role: string } }) => ({
      id: "new-id",
      email: data.email,
      role: data.role,
      disabled: false,
      createdAt: new Date(),
    }));

    const res = await POST(
      jsonRequest({
        email: "New.User@Example.com",
        password: "temp-password-1",
        role: "Operator",
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe("new.user@example.com"); // normalized
    expect(data.user.role).toBe("Operator");
    expect(data.user).not.toHaveProperty("passwordHash");

    // The stored hash must verify against the supplied temp password.
    const created = userMock.create.mock.calls[0][0].data;
    expect(created.passwordHash).not.toBe("temp-password-1");
    expect(await bcrypt.compare("temp-password-1", created.passwordHash)).toBe(
      true,
    );
  });

  it("rejects an invalid payload (bad email / short password) with 400", async () => {
    const res = await POST(
      jsonRequest({ email: "not-an-email", password: "short", role: "Operator" }),
    );
    expect(res.status).toBe(400);
    expect(userMock.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid role with 400", async () => {
    const res = await POST(
      jsonRequest({ email: "x@y.z", password: "longenough", role: "Superuser" }),
    );
    expect(res.status).toBe(400);
    expect(userMock.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the email already exists", async () => {
    userMock.findUnique.mockResolvedValue(adminUser());
    const res = await POST(
      jsonRequest({ email: "admin@example.com", password: "longenough", role: "Admin" }),
    );
    expect(res.status).toBe(409);
    expect(userMock.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users/[id] (Admin disable/enable + role)", () => {
  function patchRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/users/u1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("disables a user", async () => {
    userMock.update.mockResolvedValue({
      ...operatorUser(),
      disabled: true,
      createdAt: new Date(),
    });
    const res = await PATCH(patchRequest({ disabled: true }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(200);
    expect(userMock.update.mock.calls[0][0].data).toEqual({ disabled: true });
  });

  it("assigns a new role", async () => {
    userMock.update.mockResolvedValue({
      ...operatorUser(),
      role: "Admin",
      createdAt: new Date(),
    });
    const res = await PATCH(patchRequest({ role: "Admin" }), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(200);
    expect(userMock.update.mock.calls[0][0].data).toEqual({ role: "Admin" });
  });

  it("rejects an empty update with 400", async () => {
    const res = await PATCH(patchRequest({}), {
      params: Promise.resolve({ id: "u1" }),
    });
    expect(res.status).toBe(400);
    expect(userMock.update).not.toHaveBeenCalled();
  });
});
