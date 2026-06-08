import { issueSignedToken, presignUrl, put } from "@vercel/blob";

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

/**
 * Mint a tokenless, CDN-verified GET URL for a PRIVATE model blob that the
 * unauthenticated RunPod worker can fetch (decision #1 / T-02-03).
 *
 * The worker downloads the model with a plain `requests.get` (handler.py) — it
 * has no app session, so it cannot use the auth-gated /api/file proxy. We instead
 * mint a short-lived (~1h) signed GET URL via the verified @vercel/blob 2.4 server
 * API: issueSignedToken (server-only; uses BLOB_READ_WRITE_TOKEN/OIDC) →
 * presignUrl → { presignedUrl }.
 *
 * SEC-02: there is NO public/obscurity fallback. The presigned URL is minted on
 * demand at dispatch and never persisted. If issueSignedToken throws because OIDC
 * / BLOB_STORE_ID is unresolved, the error surfaces (a `user_setup` env gap) — we
 * never downgrade to a public URL.
 */
export async function workerModelUrl(pathname: string): Promise<string> {
  const signedToken = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil: Date.now() + 60 * 60 * 1000, // ~1h TTL
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    pathname,
    access: "private",
  });
  return presignedUrl;
}
