"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Layers,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AppRole = "Admin" | "Operator";

type NavItem = { label: string; href: string; icon: LucideIcon };

// Nav inventory. Only routes that actually exist: Jobs and Gallery are NOT
// global pages — they live per-batch (the Monitor·Gallery·Compositing tabs
// inside /batches/[id]), so they must NOT appear as top-level links (they 404).
const MAIN: NavItem[] = [
  { label: "Products", href: "/products", icon: Box },
  { label: "Batches", href: "/batches", icon: Layers },
];

const ADMIN: NavItem[] = [
  { label: "Domain Settings", href: "/admin/settings", icon: SlidersHorizontal },
  { label: "Users", href: "/admin/users", icon: Users },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // 44px min hit area via py; left 2px indicator reserved with border-l.
        "relative flex min-h-11 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-sm transition-colors",
        active
          ? "border-l-primary bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        className={cn("size-5 shrink-0", active ? "text-primary" : "")}
        strokeWidth={1.75}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SectionCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * UI-SPEC §1 left sidebar (240px). MAIN nav is always present; the ADMIN
 * section renders ONLY for Admins (convenience layer — the authoritative gate
 * is requireRole on the server, Plan 06). Settings is bottom-pinned. Active item
 * = left 2px teal bar + --accent tint + teal icon.
 */
export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <SectionCaption>Main</SectionCaption>
        {MAIN.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {role === "Admin" ? (
          <>
            <SectionCaption>Admin</SectionCaption>
            {ADMIN.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
