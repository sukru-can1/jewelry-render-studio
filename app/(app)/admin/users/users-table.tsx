"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { CreateUserDialog } from "./create-user-dialog";

type AppRole = "Admin" | "Operator";

export type AdminUser = {
  id: string;
  email: string;
  role: AppRole;
  disabled: boolean;
  createdAt: string;
};

function RoleBadge({ role }: { role: AppRole }) {
  // UI-SPEC: Admin = accent (teal override), Operator = neutral.
  if (role === "Admin") {
    return (
      <Badge
        variant="outline"
        className="border-primary/30 bg-primary/15 text-primary"
      >
        Admin
      </Badge>
    );
  }
  return <Badge variant="secondary">Operator</Badge>;
}

function StatusPill({ disabled }: { disabled: boolean }) {
  if (disabled) {
    return <Badge variant="destructive">Disabled</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className="border-success/30 bg-success/15 text-success"
    >
      Active
    </Badge>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

type ConfirmKind =
  | { type: "disable"; user: AdminUser }
  | { type: "make-admin"; user: AdminUser }
  | null;

/**
 * UI-SPEC §3 — the user-management table. Renders Email · Role · Status ·
 * Created · Actions with loading (skeleton), empty ("No users yet"), and error
 * (inline card + Retry) states. Disable-user and change-to-Admin go through a
 * destructive/sensitive confirm dialog with the exact UI-SPEC copy. Mutations
 * hit PATCH /api/admin/users/[id]; the route's requireRole is the real boundary.
 */
export function UsersTable({
  users,
  loadError,
}: {
  users: AdminUser[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmKind>(null);

  async function patchUser(
    id: string,
    body: { disabled?: boolean; role?: AppRole },
  ) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Couldn't save changes. Try again.");
        return;
      }
      toast.success("Changes saved.");
      router.refresh();
    } catch {
      toast.error("Couldn't save changes. Try again.");
    } finally {
      setPendingId(null);
      setConfirm(null);
    }
  }

  function onConfirm() {
    if (!confirm) return;
    if (confirm.type === "disable") {
      void patchUser(confirm.user.id, { disabled: true });
    } else if (confirm.type === "make-admin") {
      void patchUser(confirm.user.id, { role: "Admin" });
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-foreground">
          Couldn&apos;t load users. Check your connection and try again.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => router.refresh()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-foreground">
          No users yet
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create the first account to give your team access. Only Admins can
          manage users.
        </p>
        <div className="mt-2">
          <CreateUserDialog />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const busy = pendingId === user.id;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <StatusPill disabled={user.disabled} />
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {busy ? (
                      <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${user.email}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.role === "Operator" ? (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setConfirm({ type: "make-admin", user });
                              }}
                            >
                              Assign role: Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                void patchUser(user.id, { role: "Operator" });
                              }}
                            >
                              Assign role: Operator
                            </DropdownMenuItem>
                          )}
                          {user.disabled ? (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                void patchUser(user.id, { disabled: false });
                              }}
                            >
                              Enable user
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setConfirm({ type: "disable", user });
                              }}
                            >
                              Disable user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <DialogContent>
          {confirm?.type === "disable" ? (
            <>
              <DialogHeader>
                <DialogTitle>Disable user</DialogTitle>
                <DialogDescription>
                  {confirm.user.email} will lose access immediately and can&apos;t
                  sign in until re-enabled. Disable this account?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={onConfirm}>
                  Disable user
                </Button>
              </DialogFooter>
            </>
          ) : confirm?.type === "make-admin" ? (
            <>
              <DialogHeader>
                <DialogTitle>Make Admin</DialogTitle>
                <DialogDescription>
                  {confirm.user.email} will be able to manage users and domain
                  settings. Continue?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Cancel
                </Button>
                <Button onClick={onConfirm}>Make Admin</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

// UI-SPEC §3 loading state — 5 skeleton rows (used by the page Suspense/loading).
export function UsersTableSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-7 w-7" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
