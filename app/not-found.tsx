import Link from "next/link";

import { Button } from "@/app/components/ui/button";

// UX audit A4 — standalone root 404 for unmatched URLs outside the (app) shell.
// Mirrors the login page's centered brand moment (same wordmark classes) so a
// stray URL still lands on something that looks like the product, with one way
// home. Server Component, no client state.
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-2 text-center">
        <span className="text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground">
          Jewelry Render Studio
        </span>
        <p className="text-sm text-muted-foreground">
          This page doesn&apos;t exist or was removed.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
