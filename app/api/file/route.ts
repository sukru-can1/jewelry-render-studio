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

  const headers: Record<string, string> = {
    "Content-Type": result.blob.contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  };

  // OUT-03 / T-05-05: optional attachment download. When `download=1`, force a
  // Content-Disposition attachment so the asset saves as a file (the inline path
  // below is byte-identical to before). The filename comes from `name` (falling
  // back to the pathname basename); it is sanitized to strip CR/LF and double
  // quotes so a hostile `name` cannot inject a second header or break out of the
  // quoted filename value (header-injection guard).
  const params = new URL(req.url).searchParams;
  if (params.get("download") === "1") {
    const raw = params.get("name") ?? pathname.split("/").pop() ?? "download";
    const filename = sanitizeFilename(raw);
    // Unquoted filename token: the sanitizer already removed CR/LF, quotes and
    // path separators, so the residue is header-safe without surrounding quotes
    // (and the blob-guard test asserts no raw quote leaks into the value).
    headers["Content-Disposition"] = `attachment; filename=${filename}`;
  }

  return new NextResponse(result.stream, { headers });
}

// Strip CR/LF (header injection) and double quotes (filename-value breakout), and
// drop any path separators so a `name` like `../foo` cannot reshape the header.
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned : "download";
}
