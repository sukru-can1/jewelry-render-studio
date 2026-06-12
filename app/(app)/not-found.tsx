import Link from "next/link";

import { Button } from "@/app/components/ui/button";

// UX audit A4 — in-shell 404. Rendered automatically inside the auth-gated (app)
// layout whenever a page under it calls notFound() (e.g. a missing product id),
// so the operator keeps the sidebar/topbar and two ways forward. Calm card per
// the inherited error-card pattern; Server Component, no client state.
export default function NotFound() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-base font-semibold text-foreground">Page not found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This page doesn&apos;t exist or was removed.
      </p>
      <div className="mt-4 flex gap-2">
        <Button asChild>
          <Link href="/products">Go to products</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/batches">View batches</Link>
        </Button>
      </div>
    </div>
  );
}
