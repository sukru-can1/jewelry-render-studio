import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { updateUserSchema } from "@/lib/validation/user";

// AUTH-04/AUTH-05: Admin-only disable/enable + role assign for a single user.
// requireRole("Admin") is the FIRST line — Operators get a 403. Node runtime.
export const runtime = "nodejs";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  disabled: true,
  createdAt: true,
} as const;

function asResponse(err: unknown): Response | null {
  return err instanceof Response ? err : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("Admin");
  } catch (err) {
    const denied = asResponse(err);
    if (denied) return denied;
    throw err;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: { role?: "Admin" | "Operator"; disabled?: boolean } = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.disabled !== undefined) data.disabled = parsed.data.disabled;

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: SAFE_USER_SELECT,
    });
    return Response.json({ user });
  } catch {
    // Prisma throws P2025 when the id does not exist.
    return Response.json({ error: "User not found" }, { status: 404 });
  }
}
