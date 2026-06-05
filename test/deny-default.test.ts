// SEC-03: deny-by-default route gate. Exercises the `authorized` callback in
// auth.config.ts directly (unauth → deny except /login; authed → allow) and
// asserts via source text that middleware.ts imports nothing Node-only (the
// split-config edge-safety guard — RESEARCH Pitfall 1).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { authConfig } from "@/lib/auth/auth.config";

const authorized = authConfig.callbacks!.authorized!;

// Minimal stand-in for the Auth.js request shape the callback reads.
function call(pathname: string, loggedIn: boolean) {
  return authorized({
    // @ts-expect-error — only auth.user + request.nextUrl.pathname are read
    auth: loggedIn ? { user: { id: "u1", role: "Admin" } } : null,
    // @ts-expect-error — only nextUrl.pathname is read by the callback
    request: { nextUrl: { pathname } },
  });
}

describe("authorized callback (SEC-03 deny-by-default)", () => {
  it("denies an unauthenticated request to /admin/users", () => {
    expect(call("/admin/users", false)).toBe(false);
  });

  it("allows /login when unauthenticated (public)", () => {
    expect(call("/login", false)).toBe(true);
  });

  it("denies an unauthenticated request to the app root", () => {
    expect(call("/", false)).toBe(false);
  });

  it("allows any path when a session is present", () => {
    expect(call("/admin/users", true)).toBe(true);
    expect(call("/", true)).toBe(true);
  });
});

describe("middleware.ts edge-safety (RESEARCH Pitfall 1)", () => {
  const source = readFileSync(
    resolve(process.cwd(), "middleware.ts"),
    "utf8",
  );

  it("imports only the edge-safe auth.config (no Prisma/bcrypt/auth.ts)", () => {
    expect(source).not.toMatch(/@\/lib\/db\/prisma/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/bcryptjs/);
    // must not import the Node NextAuth instance (lib/auth/auth without .config)
    expect(source).not.toMatch(/["']@\/lib\/auth\/auth["']/);
    expect(source).toMatch(/@\/lib\/auth\/auth\.config/);
  });

  it("gates all routes with the allowlist matcher", () => {
    expect(source).toMatch(/matcher/);
    expect(source).toMatch(/api\/webhooks\/runpod/);
    expect(source).toMatch(/api\/auth/);
    expect(source).toMatch(/login/);
  });
});
