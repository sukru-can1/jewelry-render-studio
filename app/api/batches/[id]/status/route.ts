import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { batchProgress, deriveBatchStatus } from "@/lib/orchestration/batch-status";

// ORCH-04 / ORCH-02 — the client freshness poll source. requireSession() FIRST
// (T-04-10, fail-closed), IDOR-load the batch by id (T-04-11, 404 if missing),
// then return a DB-derived snapshot: counts + derived status + per-job statuses.
// DB-ONLY: this route reads Postgres only and MUST NOT import lib/runpod — it
// never fans out to RunPod (T-04-12, bounded constant-cost). The payload exposes
// only id/status/attempt/timestamps — never secrets, env names, or raw recipe
// (T-04-13).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    select: { id: true, cancelRequestedAt: true },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const progress = await batchProgress(batch.id);
  const status = deriveBatchStatus(progress, batch.cancelRequestedAt);

  const jobs = await prisma.job.findMany({
    where: { batchId: batch.id },
    select: {
      id: true,
      status: true,
      attempt: true,
      startedAt: true,
      finishedAt: true,
    },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({ status, progress, jobs });
}
