import { auth } from "./auth";
import type { Session } from "next-auth";

// RESEARCH Pattern 2: the authoritative server-side RBAC boundary (AUTH-03/05).
// Middleware is a coarse first gate; these helpers are the real check and are
// called as the first line of every protected route handler / server action.
// Both throw a `Response` (401/403) so a handler that forgets to catch still
// fails closed rather than leaking data.

/**
 * Require an authenticated session. Throws a 401 Response if none.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

/**
 * Require a specific role. Throws 401 if unauthenticated, 403 if the session's
 * role is insufficient. Only "Admin" is privileged here: an Operator hitting an
 * Admin-gated route gets a 403 (AUTH-05) — UI hiding is NOT the boundary.
 */
export async function requireRole(
  role: "Admin" | "Operator",
): Promise<Session> {
  const session = await requireSession();
  const userRole = session.user.role;
  if (role === "Admin" && userRole !== "Admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return session;
}
