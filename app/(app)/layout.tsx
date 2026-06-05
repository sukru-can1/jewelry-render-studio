import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/lib/auth/auth";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Sidebar } from "@/app/components/app-shell/sidebar";
import { Topbar } from "@/app/components/app-shell/topbar";

// UI-SPEC §1 — the global app shell hosting every authenticated route. It gates
// on auth() (deny-by-default belt-and-suspenders alongside middleware), then
// renders the topbar + sidebar with the content column in between.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { email, role } = session.user;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Topbar email={email ?? ""} role={role} />
      <div className="flex min-h-0 flex-1">
        <Sidebar role={role} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
            <Suspense fallback={<ContentSkeleton />}>{children}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
