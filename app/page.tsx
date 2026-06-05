import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";

// Thin root redirect. The root `/` no longer renders the legacy enterprise UI —
// it simply routes by auth state: authenticated users land on the Products
// workspace, everyone else goes to /login. The authenticated landing lives at
// app/(app)/products/page.tsx (NOT app/(app)/page.tsx) so `/` and the (app)
// group never resolve to the same path (no parallel-page collision).
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/products" : "/login");
}
