import { get } from "@vercel/blob";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { putPrivate, privateUrl } from "@/lib/blob";
import {
  groupVariantsForCompositing,
  type LayerWithCombo,
  type CompositingLayer,
} from "@/lib/compositing/variants";
import { flattenVariant } from "@/lib/compositing/flatten";
import { deliverablePathname } from "@/lib/compositing/deliverable";

// COMP-02 / T-06-01..05: per-variant SERVER flatten. sharp (libvips) is a native
// Node addon, so this is the Node runtime (NOT edge). The layer set is derived
// from completed-job Layer rows under the IDOR-scoped batch — NEVER from a
// caller-supplied pathname (T-06-02/04). Each layer's bytes are read PRIVATELY via
// get(pathname,{access:"private"}) (SEC-02) and composited from Buffers; the
// deliverable is persisted blob-only at a deterministic pathname with
// allowOverwrite:true (idempotent; NO Layer DB row — Layer.jobId is @unique + a
// required FK, so a synthetic deliverable jobId is infeasible).
//
// One variant per request keeps the composite + blob fetches well under the global
// maxDuration:60 (T-06-05).
export const runtime = "nodejs";

type Combo = {
  angleKey?: string;
  metalKey?: string;
  pass?: string;
  stoneGroup?: string;
  sortOrder?: number;
};

export async function POST(
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

  // IDOR scope: load the batch by route param. Fail-closed 404 when missing — a
  // caller can only ever flatten a batch the DB confirms exists by this id.
  const batch = await prisma.batch.findUnique({ where: { id } });
  if (!batch) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Untrusted variant selectors. Accept from query (?angle=&metal=&force=) or body.
  const url = new URL(req.url);
  const body = await readBody(req);
  const angle = url.searchParams.get("angle") ?? body.angle ?? null;
  const metal = url.searchParams.get("metal") ?? body.metal ?? null;
  const force = url.searchParams.get("force") === "1" || body.force === true || body.force === "1";
  if (!angle || !metal) {
    return NextResponse.json(
      { error: "Missing angle/metal" },
      { status: 400 },
    );
  }

  // Derive the variant's layers from THIS batch's completed-job Layer rows — never
  // from caller pathnames. Completed jobs only (layers exist for terminal jobs).
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
          stoneGroup: combo.stoneGroup,
          sortOrder: combo.sortOrder,
        },
      });
    }
  }

  const variants = groupVariantsForCompositing(rows);
  const variant = variants.find(
    (v) => v.angleKey === angle && v.metalKey === metal,
  );
  if (!variant) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Private layer-byte fetcher — sharp needs a Buffer, never a remote URL (SEC-02).
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

  const result = await flattenVariant(variant, fetchLayer, { force });

  // Gate FAIL → 200 {ok:false, warnings} and NO write (never a silent flatten).
  if (!result.ok) {
    return NextResponse.json({ ok: false, warnings: result.warnings });
  }

  // PASS → persist blob-only, idempotently overwriting the SAME deterministic
  // pathname. No DB Layer row (Layer.jobId @unique + required FK conflict).
  const pathname = deliverablePathname(id, angle, metal);
  await putPrivate(pathname, result.buffer, {
    allowOverwrite: true,
    contentType: "image/png",
  });

  return NextResponse.json({
    ok: true,
    deliverable: {
      url: privateUrl(pathname),
      format: result.deliverable.format,
      width: result.deliverable.width,
      height: result.deliverable.height,
    },
  });
}

// Best-effort JSON body read (the route prefers query params; the body is a
// fallback for clients that POST JSON). Never throws — a malformed/empty body just
// yields {} so the query params win.
async function readBody(
  req: NextRequest,
): Promise<{ angle?: string; metal?: string; force?: unknown }> {
  try {
    const text = await req.clone().text();
    if (!text) return {};
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return {
      angle: typeof parsed.angle === "string" ? parsed.angle : undefined,
      metal: typeof parsed.metal === "string" ? parsed.metal : undefined,
      force: parsed.force,
    };
  } catch {
    return {};
  }
}
