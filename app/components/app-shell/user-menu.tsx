"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

type AppRole = "Admin" | "Operator";

function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

/**
 * UI-SPEC §1 — user avatar menu, present on every authenticated app page.
 * Shows identity + role badge + Settings + Log out (AUTH-02). Log out calls the
 * signOutAction server action which clears the session cookie and lands on
 * /login (T-1-SESSION mitigation).
 */
export function UserMenu({ email, role }: { email: string; role: AppRole }) {
  const [pending, startTransition] = React.useTransition();

  function handleLogout() {
    startTransition(() => {
      void signOutAction();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Open user menu"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1.5 py-2">
          <span className="truncate text-sm font-medium text-foreground">
            {email}
          </span>
          <Badge
            variant={role === "Admin" ? "outline" : "secondary"}
            className={
              role === "Admin"
                ? "w-fit border-primary/30 bg-primary/15 text-primary"
                : "w-fit"
            }
          >
            {role}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            handleLogout();
          }}
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
