// OUT-02 — DB-only gallery read. Loads a batch by id with its COMPLETED jobs and
// their Layer rows joined in. Layers exist only for completed (terminal, settled)
// jobs, so the gallery NEVER re-fetches RunPod — this module imports prisma ONLY
// and MUST NOT import @/lib/runpod (the orch-db-only source guard covers callers).
//
// IDOR scope: the batch is loaded by the caller-supplied id; a missing one yields
// null so the gallery Server Component renders its calm "Couldn't load" state.

import { prisma } from "@/lib/db/prisma";

export type GalleryLayer = {
  id: string;
  jobId: string;
  pass: string;
  format: string;
  url: string;
  metadataUrl: string | null;
  isFlattened: boolean;
  combo: Record<string, unknown> | null;
};

export type BatchGallery = {
  id: string;
  productName: string;
  matrix: Record<string, unknown> | null;
  /** All jobs (any status) for the partial-progress banner — counts only. */
  jobCounts: { status: string; count: number }[];
  totalJobs: number;
  /** Layer rows from COMPLETED jobs only, flattened with their job's combo. */
  layers: GalleryLayer[];
};

export async function loadBatchGallery(id: string): Promise<BatchGallery | null> {
  let batch;
  try {
    batch = await prisma.batch.findUnique({
      where: { id },
      include: { product: { select: { name: true } } },
    });
  } catch {
    return null;
  }
  if (!batch) return null;

  // Completed jobs + their layers — DB-only, NO RunPod. The test guard asserts
  // where.batchId === id, where.status === "completed", include.layers === true.
  let completedJobs;
  try {
    completedJobs = await prisma.job.findMany({
      where: { batchId: id, status: "completed" },
      include: { layers: true },
    });
  } catch {
    return null;
  }

  // Per-status counts (any status) for the partial banner — derived from a
  // grouped count, still DB-only.
  let grouped: { status: string; _count: number }[] = [];
  try {
    const rows = await prisma.job.groupBy({
      by: ["status"],
      where: { batchId: id },
      _count: true,
    });
    grouped = rows.map((r: { status: string; _count: number }) => ({
      status: r.status,
      _count: r._count,
    }));
  } catch {
    grouped = [];
  }

  const jobCounts = grouped.map((g) => ({ status: g.status, count: g._count }));
  const totalJobs = jobCounts.reduce((n, g) => n + g.count, 0);

  const layers: GalleryLayer[] = [];
  for (const job of completedJobs) {
    const combo = (job.combo ?? null) as Record<string, unknown> | null;
    for (const layer of job.layers ?? []) {
      layers.push({
        id: layer.id,
        jobId: layer.jobId,
        pass: layer.pass,
        format: layer.format,
        url: layer.url,
        metadataUrl: layer.metadataUrl ?? null,
        isFlattened: layer.isFlattened,
        combo,
      });
    }
  }

  return {
    id: batch.id,
    productName: batch.product?.name ?? "Untitled product",
    matrix: (batch.matrix ?? null) as Record<string, unknown> | null,
    jobCounts,
    totalJobs,
    layers,
  };
}
