import { ZipArchive } from "archiver";
import { get, list } from "@vercel/blob";
import { PassThrough, Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { putPrivate } from "@/lib/blob";
import {
  groupVariantsForCompositing,
  type LayerWithCombo,
  type CompositingLayer,
} from "@/lib/compositing/variants";
import { flattenVariant } from "@/lib/compositing/flatten";
import {
  deliverablePathname,
  deliverablePrefix,
} from "@/lib/compositing/deliverable";

// OUT-03 / T-05-04/06/07: auth-gated, batch-scoped zip delivery of a batch's
// layers. archiver needs Node streams, so this route is the Node runtime (NOT
// edge). The layer set is derived from DB rows loaded by params.id (IDOR scope —
// never from caller-supplied pathnames), and every blob is read PRIVATELY via
// get(pathname,{access:"private"}). No public/signed URL is constructed.
//
// T-05-08 (DoS): the archive is streamed (Readable.toWeb), never buffered, to
// stay under the global maxDuration:60. Very large batches (>~50-80 layers)
// should prefer the ?scope= narrowing (RESEARCH Open Question 3) so a single
// request does not overrun the wall clock.
//
// COMP-03 (?deliverables=1): zips ONLY the batch's flattened deliverables (the
// renders/<batchId>/deliverables/ blobs). Already-flattened deliverables are
// discovered by blob prefix (BLOB-ONLY persistence — there is NO isFlattened
// Layer row to query, 06-01 decision). Missing deliverables are flattened LAZILY
// and CAPPED so a single request never overruns 60s (T-06-12); beyond the cap the
// remainder is skipped and noted in X-Deliverables-Note.
export const runtime = "nodejs";

// CAP (RESEARCH §60s Vercel Cap Strategy): flatten at most this many MISSING
// deliverables inline per request. A variant flatten = a handful of blob fetches +
// one sharp composite (sub-second to a few seconds); 10 stays comfortably under the
// 60s ceiling. Beyond the cap, variants are skipped and the operator is told to
// flatten the rest from the compositing page (one-variant-per-request flatten route).
const LAZY_FLATTEN_CAP = 10;

type Combo = {
  angleKey?: string;
  metalKey?: string;
  pass?: string;
  stoneGroup?: string;
  sortOrder?: number;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // AUTH BOUNDARY — first line. requireSession throws a 401 Response for unauth callers.
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof Response) return error;
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // IDOR scope: load the batch by route param. Fail-closed 404 when missing —
  // a caller can only ever zip a batch the DB confirms exists by this id.
  const batch = await prisma.batch.findUnique({ where: { id } });
  if (!batch) {
    return new NextResponse("Not found", { status: 404 });
  }

  const searchParams = new URL(req.url).searchParams;

  // COMP-03 — the deliverables zip mode. Branches into a fully separate path that
  // zips the deliverables/ blobs (lazily flattening missing ones, capped); the
  // default raw-layer path below is unchanged.
  if (searchParams.get("deliverables") === "1") {
    return deliverablesZip(id);
  }

  // Optional ?scope= narrows to one metal/variant; the layer set is ALWAYS
  // derived from DB rows, never from a caller-supplied pathname list.
  const scope = searchParams.get("scope");

  const jobs = await prisma.job.findMany({
    where: { batchId: id },
    include: { layers: true },
  });

  // archiver 8 is ESM and exposes named format classes (the old callable
  // `archiver("zip")` factory was removed). Construct the zip stream directly.
  const archive = new ZipArchive();
  // Pipe the archive into a PassThrough we hand to the Web Response. This is the
  // idiomatic archiver streaming bridge and keeps the route streaming (never
  // buffering) so it stays under maxDuration:60 (T-05-08).
  const passthrough = new PassThrough();
  archive.pipe(passthrough);
  // archiver emits "error" asynchronously; surface it instead of silently hanging.
  archive.on("error", (err: unknown) => {
    console.error("zip archive error", err);
    passthrough.destroy(err instanceof Error ? err : new Error(String(err)));
  });

  const seen = new Set<string>();
  for (const job of jobs) {
    const combo = (job.combo ?? {}) as Combo;
    if (scope && combo.metalKey && combo.metalKey !== scope) continue;
    for (const layer of job.layers ?? []) {
      // Read each layer PRIVATELY — never a public/signed URL.
      const result = await get(layer.url, { access: "private" });
      if (!result || result.statusCode !== 200) continue;
      const entryName = uniqueName(seen, buildEntryName(combo, layer));
      archive.append(Readable.fromWeb(result.stream as never), {
        name: entryName,
      });
    }
  }

  void archive.finalize();

  const filename = sanitizeFilename(`batch_${id}.zip`);
  return new Response(Readable.toWeb(passthrough) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "private, no-cache",
    },
  });
}

// COMP-03 — zip ONLY the batch's flattened deliverables. The batch is already
// IDOR-loaded by the caller (GET) before this runs; `id` is that confirmed batch.
//
// Discovery is BLOB-ONLY (06-01): the already-flattened deliverables are the blobs
// under deliverablePrefix(id); we never query an isFlattened Layer row. The variant
// set comes from this batch's completed-job Layer rows (so deliverable pathnames are
// derived from DB variants, never from caller input — T-06-10). For each variant
// whose deliverable blob is MISSING, we flatten it lazily — but only up to
// LAZY_FLATTEN_CAP per request (T-06-12); beyond that, variants are skipped and the
// remainder is reported in X-Deliverables-Note (a partial zip beats a 60s overrun).
async function deliverablesZip(id: string): Promise<Response> {
  // Enumerate the batch's (angle×metal) variants from completed-job Layer rows.
  const jobs = await prisma.job.findMany({
    where: { batchId: id, status: "completed" },
    include: { layers: true },
  });

  const rows: LayerWithCombo[] = [];
  for (const job of jobs) {
    const combo = (job.combo ?? {}) as Combo;
    for (const layer of job.layers ?? []) {
      rows.push({
        id: layer.id,
        pass: layer.pass,
        url: layer.url,
        format: layer.format,
        combo: {
          angleKey: combo.angleKey,
          metalKey: combo.metalKey,
          pass: combo.pass ?? layer.pass,
          stoneGroup: (layer as { combo?: { stoneGroup?: string } }).combo?.stoneGroup ?? combo.stoneGroup,
          sortOrder: combo.sortOrder,
        },
      });
    }
  }
  const variants = groupVariantsForCompositing(rows);

  // BLOB-ONLY discovery: which deliverables already exist (no isFlattened DB row).
  // A list failure degrades to "none exist" — every needed variant just gets a lazy
  // flatten attempt (capped), so the zip still produces what it can.
  const existing = new Set<string>();
  try {
    const { blobs } = await list({ prefix: deliverablePrefix(id), limit: 1000 });
    for (const b of blobs) existing.add(b.pathname);
  } catch (err) {
    console.error("deliverables list failed", err);
  }

  // Private layer-byte fetcher for the lazy-flatten path — sharp needs a Buffer,
  // never a remote/public URL (SEC-02).
  const fetchLayer = async (layer: CompositingLayer): Promise<Buffer> => {
    const result = await get(layer.url, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error(`layer not found: ${layer.url}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.fromWeb(result.stream as never)) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  const archive = new ZipArchive();
  const passthrough = new PassThrough();
  archive.pipe(passthrough);
  archive.on("error", (err: unknown) => {
    console.error("zip archive error", err);
    passthrough.destroy(err instanceof Error ? err : new Error(String(err)));
  });

  const seen = new Set<string>();
  const total = variants.length;
  let included = 0;
  let lazyFlattens = 0;
  let skipped = 0;

  for (const variant of variants) {
    if (!variant.angleKey || !variant.metalKey) continue;
    const pathname = deliverablePathname(id, variant.angleKey, variant.metalKey);

    // Lazily flatten a MISSING deliverable, but only up to the cap.
    if (!existing.has(pathname)) {
      if (lazyFlattens >= LAZY_FLATTEN_CAP) {
        skipped += 1;
        continue;
      }
      lazyFlattens += 1;
      try {
        const result = await flattenVariant(variant, fetchLayer);
        if (!result.ok) {
          // Gate FAIL (e.g. dimension mismatch / empty overlay) — skip + note it,
          // never composite a bad deliverable into the zip.
          skipped += 1;
          continue;
        }
        await putPrivate(pathname, result.buffer, {
          allowOverwrite: true,
          contentType: "image/png",
        });
        existing.add(pathname);
      } catch (err) {
        console.error("lazy flatten failed", pathname, err);
        skipped += 1;
        continue;
      }
    }

    // Append the deliverable's bytes — read PRIVATELY (never a public/signed URL).
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      skipped += 1;
      continue;
    }
    const entryName = uniqueName(
      seen,
      sanitizeFilename(`${variant.angleKey}_${variant.metalKey}.png`),
    );
    archive.append(Readable.fromWeb(result.stream as never), { name: entryName });
    included += 1;
  }

  void archive.finalize();

  const headers: Record<string, string> = {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename=${sanitizeFilename(`batch_${id}_deliverables.zip`)}`,
    "Cache-Control": "private, no-cache",
  };
  // Partial set (over cap or gate-blocked variants): note it so the client can tell
  // the operator to flatten the rest (one-variant-per-request flatten route). The
  // value is ASCII + sanitized of CR/LF so it can never inject a second header.
  if (skipped > 0) {
    headers["X-Deliverables-Note"] = sanitizeHeaderValue(
      `${included} of ${total} included; open each variant to flatten the rest`,
    );
  }

  return new Response(Readable.toWeb(passthrough) as ReadableStream, { headers });
}

// Human entry name from the combo + layer: {angle}_{metal}_{group?}_{pass}.{ext}.
function buildEntryName(
  combo: Combo,
  layer: { pass: string; format?: string; url: string },
): string {
  const ext = layer.format || layer.url.split(".").pop() || "png";
  const parts = [
    combo.angleKey,
    combo.metalKey,
    combo.stoneGroup,
    combo.pass ?? layer.pass,
  ].filter(Boolean);
  const base = parts.length > 0 ? parts.join("_") : "layer";
  return sanitizeFilename(`${base}.${ext}`);
}

// Disambiguate identical entry names so the zip never silently drops a layer.
function uniqueName(seen: Set<string>, name: string): string {
  if (!seen.has(name)) {
    seen.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}_${n}${ext}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${stem}_${n}${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

// Strip CR/LF (header-injection guard) from a free-text header value; collapse
// other control chars to spaces so X-Deliverables-Note can never inject a 2nd header.
function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f]/g, " ").trim();
}

// Strip CR/LF (header injection), quotes (value breakout) and path separators.
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned : "download.zip";
}
