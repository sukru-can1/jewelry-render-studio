import { ZipArchive } from "archiver";
import { get } from "@vercel/blob";
import { PassThrough, Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

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
export const runtime = "nodejs";

type Combo = {
  angleKey?: string;
  metalKey?: string;
  pass?: string;
  stoneGroup?: string;
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

  // Optional ?scope= narrows to one metal/variant; the layer set is ALWAYS
  // derived from DB rows, never from a caller-supplied pathname list.
  const scope = new URL(req.url).searchParams.get("scope");

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

// Strip CR/LF (header injection), quotes (value breakout) and path separators.
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned : "download.zip";
}
