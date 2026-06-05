import { put } from "@vercel/blob";

// SEC-02 (RESEARCH Pattern 4 — corrected private-blob model): all NEW blob writes
// must be private. Private blobs are NOT delivered via signed URLs (that API does
// not exist for private storage — RESEARCH Pitfall 5); they are streamed through
// the auth-gated proxy at `GET /api/file?pathname=…` (app/api/file/route.ts).
//
// Legacy PUBLIC blobs written before this hardening are accepted-as-burned for
// Phase 1; re-uploading them as private is a Phase-8 concern (Open Question 3).

type PutData = Parameters<typeof put>[1];
type PutOptions = Parameters<typeof put>[2];

/**
 * Write a blob to PRIVATE storage. Forces `access: "private"` so callers can
 * never accidentally publish a public URL. Returns the @vercel/blob put result
 * (its `pathname` is what you pass to {@link privateUrl} for delivery).
 */
export async function putPrivate(
  pathname: string,
  data: PutData,
  opts: Omit<PutOptions, "access"> = {},
) {
  return put(pathname, data, { ...opts, access: "private" });
}

/**
 * Build the auth-gated delivery URL for a private blob. Consumers (gallery /
 * delivery routes land in later phases) fetch this; the proxy verifies the
 * session next to `get(pathname,{access:'private'})`.
 */
export function privateUrl(pathname: string): string {
  return `/api/file?pathname=${encodeURIComponent(pathname)}`;
}
