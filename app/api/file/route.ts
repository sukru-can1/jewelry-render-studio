import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/rbac";

export const runtime = "nodejs";

// SEC-02 (RESEARCH Pattern 4 — corrected private-blob model): private Blob assets
// are delivered ONLY through this auth-gated proxy. Private blobs have NO
// time-limited-URL scheme (RESEARCH Pitfall 5). Auth is verified IN this handler, right
// next to get() — Vercel explicitly warns AGAINST gating private blobs via
// middleware (a middleware bug could expose cached content).
export async function GET(req: NextRequest) {
  // AUTH BOUNDARY — first, next to get(). Throws a 401 Response for unauth callers.
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof Response) return error;
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Parse from req.url (works for both NextRequest and a plain Request) rather
  // than req.nextUrl, so the handler is agnostic to how it is invoked.
  const pathname = new URL(req.url).searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  // get() returns null when the blob does not exist, or a discriminated union on
  // statusCode (200 = body present; 304 = not-modified, no body) per @vercel/blob v2.
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
