import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

import { LoginForm } from "./login-form";

// UI-SPEC §2 — Login brand moment, internal-tool feel. Centered single card
// (max-width 400px) on the dominant background; Display-size wordmark above.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // If already signed in, skip the login surface entirely.
  const session = await auth();
  const { from } = await searchParams;

  // Only honor in-app relative redirect targets (avoid open-redirect).
  const safeFrom =
    from && from.startsWith("/") && !from.startsWith("//") ? from : "/products";

  if (session?.user) {
    redirect(safeFrom);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground">
            Jewelry Render Studio
          </span>
          <p className="text-sm text-muted-foreground">
            Sign in to continue to your workspace.
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <h1 className="text-xl font-semibold leading-tight text-foreground">
              Sign in
            </h1>
          </CardHeader>
          <CardContent>
            <LoginForm from={safeFrom} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
