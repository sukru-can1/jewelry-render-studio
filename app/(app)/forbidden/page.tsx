import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/app/components/ui/button";

// UI-SPEC §5 — calm 403 surface. Lives INSIDE the (app) shell so a logged-in
// Operator who deep-links an Admin route still sees the chrome (sidebar, topbar,
// user menu with Log out). This mirrors the server-side 403 (AUTH-05, Plan 06);
// it is the friendly UI, not the security boundary.
export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ShieldAlert className="size-6" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold leading-tight text-foreground">
          {"You don't have access to this area."}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This section is Admin-only.
        </p>
      </div>
      <Button asChild>
        <Link href="/products">Back to Products</Link>
      </Button>
    </div>
  );
}
