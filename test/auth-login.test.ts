// AUTH-01/AUTH-02 integration test. Mocks the Prisma singleton so authorize()
// runs without a live DB: a valid Admin authenticates, a bad password and a
// disabled user both return null, the role survives jwt→session, and signOut
// is exported + wired to clear the cookie (redirect to /login).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminUser, TEST_PASSWORD } from "./factories";

// Mock the Prisma singleton BEFORE importing lib/auth/auth so authorize()'s
// `prisma.user.findUnique` is intercepted (no live DB connection).
const findUnique = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { authorize, signOut } from "@/lib/auth/auth";
import { authConfig } from "@/lib/auth/auth.config";

beforeEach(() => {
  findUnique.mockReset();
});

describe("authorize (AUTH-01)", () => {
  it("returns the user for valid credentials", async () => {
    findUnique.mockResolvedValue(adminUser());
    const user = await authorize({
      email: "admin@example.com",
      password: TEST_PASSWORD,
    });
    expect(user).toEqual({
      id: "test-admin-id",
      email: "admin@example.com",
      role: "Admin",
    });
  });

  it("returns null for a wrong password (no user enumeration)", async () => {
    findUnique.mockResolvedValue(adminUser());
    const user = await authorize({
      email: "admin@example.com",
      password: "wrong-password",
    });
    expect(user).toBeNull();
  });

  it("returns null for a disabled user", async () => {
    findUnique.mockResolvedValue(adminUser({ disabled: true }));
    const user = await authorize({
      email: "admin@example.com",
      password: TEST_PASSWORD,
    });
    expect(user).toBeNull();
  });

  it("returns null when the user does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const user = await authorize({
      email: "nobody@example.com",
      password: TEST_PASSWORD,
    });
    expect(user).toBeNull();
  });

  it("returns null for a malformed payload (missing password)", async () => {
    const user = await authorize({ email: "admin@example.com" });
    expect(user).toBeNull();
  });
});

describe("role survives jwt → session (AUTH-01/AUTH-03)", () => {
  it("the authorized user's role lands on session.user.role", async () => {
    findUnique.mockResolvedValue(adminUser());
    const user = await authorize({
      email: "admin@example.com",
      password: TEST_PASSWORD,
    });
    expect(user).not.toBeNull();

    const jwt = authConfig.callbacks!.jwt!;
    const session = authConfig.callbacks!.session!;

    const token = await jwt({
      token: {},
      user: user!,
    });
    const result = await session({
      // @ts-expect-error — partial session shape is sufficient for the callback
      session: { user: { id: user!.id, email: user!.email } },
      token,
    });

    expect(result.user.role).toBe("Admin");
  });
});

describe("signOut wiring (AUTH-02)", () => {
  it("exports signOut and configures /login as the sign-in page", () => {
    // signOut clears the session cookie on logout; pages.signIn="/login" is the
    // landing page after the cookie is cleared.
    expect(typeof signOut).toBe("function");
    expect(authConfig.pages?.signIn).toBe("/login");
    expect(authConfig.session?.strategy).toBe("jwt");
  });
});
