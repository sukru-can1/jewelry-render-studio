import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type AppRole = "Admin" | "Operator";

/**
 * UI-SPEC §1 top bar (56px): wordmark left; theme toggle + user avatar menu
 * right. The user menu hosts Log out (AUTH-02) and is present on every
 * authenticated app page.
 */
export function Topbar({ email, role }: { email: string; role: AppRole }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4">
      <Link
        href="/products"
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <span className="inline-block size-5 rounded-md bg-primary" aria-hidden />
        Jewelry Render Studio
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={email} role={role} />
      </div>
    </header>
  );
}
