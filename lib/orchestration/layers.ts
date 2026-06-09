// OUT-01 / locked decision D-2 — derive exactly one Layer row from a completed job's
// worker output, idempotently. The gallery (Plan 04) reads Layer rows; this is what
// CREATES them. Called from the shared completion writer (webhook.ts COMPLETED branch,
// which reconcile.ts replays through), so future completions get a Layer for free.
//
// Mapping contract (handler.py output + expand.ts Combo):
//   image_blob.pathname (or image_key) -> Layer.url   (PATHNAME, never the public
//                                          image_url — SEC-02 / T-05-02 / T-05-03)
//   metadata_key (or metadata_blob.pathname) -> Layer.metadataUrl
//   combo.pass                          -> Layer.pass
//   image_blob.content_type             -> Layer.format ("image/png" -> "png", derived,
//                                          NEVER hardcoded)
// Idempotency (T-05-01): upsert on {jobId} (Layer.jobId @unique) — a duplicate/late
// completion is a no-op second upsert against the SAME unique row, never a new insert.

import { prisma } from "@/lib/db/prisma";
import type { Combo } from "@/lib/batches/expand";

type WorkerBlob = { pathname?: unknown; content_type?: unknown };
type WorkerOutput = {
  image_key?: unknown;
  image_blob?: WorkerBlob;
  metadata_key?: unknown;
  metadata_blob?: WorkerBlob;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Derive a Layer format from the worker content_type, falling back to the path extension. */
function deriveFormat(contentType: string | undefined, pathname: string): string {
  if (contentType && contentType.includes("/")) {
    // "image/png" -> "png", "image/jpeg" -> "jpeg"
    return contentType.split("/")[1].toLowerCase();
  }
  const ext = pathname.split(".").pop();
  return ext ? ext.toLowerCase() : "png";
}

/**
 * Map a worker output object into a Layer and upsert it idempotently by jobId.
 *
 * `combo` carries the pass (and stoneGroup) coordinate persisted on the Job. Guards
 * against malformed/missing output: with no image pathname there is nothing to record,
 * so it skips (does NOT throw) — at-least-once webhook hygiene.
 */
export async function deriveLayerFromResult(
  jobId: string,
  combo: Pick<Combo, "pass" | "stoneGroup"> | null | undefined,
  output: unknown,
): Promise<void> {
  if (!output || typeof output !== "object") return;
  const out = output as WorkerOutput;

  // PATHNAME only — never the worker-supplied public url (SEC-02 / T-05-02 / T-05-03).
  const url = str(out.image_blob?.pathname) ?? str(out.image_key);
  if (!url) return; // malformed output — skip, do not throw.

  const metadataUrl = str(out.metadata_key) ?? str(out.metadata_blob?.pathname) ?? null;
  const format = deriveFormat(str(out.image_blob?.content_type), url);
  const pass = combo?.pass ?? "stone";

  const data = { pass, format, url, metadataUrl };

  // Idempotent: same where:{jobId} on every (re)call — never a second insert key.
  await prisma.layer.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  });
}
