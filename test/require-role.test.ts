// AUTH-03/AUTH-05: server-side RBAC boundary. Stubs `auth()` (the only Node
// dependency in rbac.ts) so we exercise requireSession/requireRole without a
// live session, and verifies the jwt/session callbacks carry the role.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSession } from "./setup";

// Stub the Node `auth()` so rbac.ts resolves whatever session we inject.
const authMock = vi.fn();
vi.mock("@/lib/auth/auth", () => ({
  auth: () => authMock(),
}));

import { requireRole, requireSession } from "@/lib/auth/rbac";
import { authConfig } from "@/lib/auth/auth.config";

beforeEach(() => {
  authMock.mockReset();
});

describe("requireSession", () => {
  it("throws a 401 Response when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  });

  it("returns the session when authenticated", async () => {
    const session = fakeSession("Admin");
    authMock.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
  });
});

describe("requireRole", () => {
  it("throws a 403 Response for an Operator hitting an Admin route", async () => {
    authMock.mockResolvedValue(fakeSession("Operator"));
    await expect(requireRole("Admin")).rejects.toMatchObject({ status: 403 });
  });

  it("returns the session for an Admin hitting an Admin route", async () => {
    const session = fakeSession("Admin");
    authMock.mockResolvedValue(session);
    await expect(requireRole("Admin")).resolves.toBe(session);
  });

  it("throws a 401 (not 403) when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireRole("Admin")).rejects.toMatchObject({ status: 401 });
  });
});

describe("jwt/session callbacks carry the role (AUTH-03)", () => {
  it("jwt callback copies user.role onto token.role", async () => {
    const jwt = authConfig.callbacks!.jwt!;
    const token = await jwt({
      token: {},
      user: { id: "u1", email: "a@b.c", role: "Admin" },
    });
    expect(token.role).toBe("Admin");
  });

  it("session callback copies token.role onto session.user.role", async () => {
    const session = authConfig.callbacks!.session!;
    const result = await session({
      // @ts-expect-error — partial session shape is sufficient for the callback
      session: { user: { id: "u1", email: "a@b.c" } },
      token: { role: "Operator" },
    });
    expect(result.user.role).toBe("Operator");
  });
});
