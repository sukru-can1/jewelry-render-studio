import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { CreateUserDialog } from "./create-user-dialog";
import { UsersTable, type AdminUser } from "./users-table";

// UI-SPEC §3 — Admin user management, hosted inside the (app) shell so the
// sidebar/topbar/logout chrome is present. requireRole("Admin") runs FIRST
// (AUTH-05 server boundary): a forced Operator deep-link 403s here even though
// the ADMIN nav is hidden — we mirror that server 403 onto the calm /forbidden
// surface. Node runtime (Prisma + the auth boundary are not edge-safe).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  try {
    await requireRole("Admin");
  } catch (err) {
    // requireRole throws a 403 Response for an Operator; show the calm 403.
    if (err instanceof Response && err.status === 403) {
      redirect("/forbidden");
    }
    throw err;
  }

  let users: AdminUser[] = [];
  let loadError = false;
  try {
    const rows = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        disabled: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    users = rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      disabled: u.disabled,
      createdAt: u.createdAt.toISOString(),
    }));
  } catch {
    loadError = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage who can access the studio and what they can do.
          </p>
        </div>
        {users.length > 0 && !loadError ? <CreateUserDialog /> : null}
      </header>

      <UsersTable users={users} loadError={loadError} />
    </div>
  );
}
