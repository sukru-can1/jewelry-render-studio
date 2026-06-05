import bcrypt from "bcryptjs";

import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { createUserSchema } from "@/lib/validation/user";

// AUTH-04/AUTH-05: Admin-only user create + list. requireRole("Admin") is the
// FIRST line of BOTH handlers — the authoritative server boundary (not the
// hidden nav). Operators get a 403 here regardless of UI gating. Node runtime
// (bcrypt + Prisma are not edge-safe).
export const runtime = "nodejs";

// The select that NEVER exposes passwordHash (T-1-DISCLOSE mitigation).
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  disabled: true,
  createdAt: true,
} as const;

// requireRole throws a `Response` (401/403) when the gate fails. Re-throwing it
// as the handler's return value keeps the boundary fail-closed without a 500.
function asResponse(err: unknown): Response | null {
  return err instanceof Response ? err : null;
}

export async function GET() {
  try {
    await requireRole("Admin");
  } catch (err) {
    const denied = asResponse(err);
    if (denied) return denied;
    throw err;
  }

  const users = await prisma.user.findMany({
    select: SAFE_USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ users });
}

export async function POST(req: Request) {
  try {
    await requireRole("Admin");
  } catch (err) {
    const denied = asResponse(err);
    if (denied) return denied;
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password, role } = parsed.data;

  // Reject duplicates with a clear 409 rather than letting Prisma throw P2002.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json(
      { error: "A user with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, role },
    select: SAFE_USER_SELECT,
  });

  return Response.json({ user }, { status: 201 });
}
