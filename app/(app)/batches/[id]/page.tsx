import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/app/components/ui/button";
import {
  deriveBatchStatus,
  summarizeJobs,
  type BatchProgress,
} from "@/lib/orchestration/batch-status";
import { isTerminal } from "@/lib/orchestration/status-map";
// INTEL-05: DB-only projection of Job.intel/intelState for the operator panel.
import { loadBatchIntel } from "@/lib/intelligence/read";
// Full-pass-first preview preference (pure helper, shared with the gallery).
import { preferredPreviewLayer } from "@/lib/gallery/group";

import { BatchStatusPill } from "../status-pill";
import { CancelBatchControl } from "./cancel-controls";
import { IntelPanel } from "./intel-panel";
import { JobsMonitor, type MonitorJob, type MonitorSnapshot } from "./jobs-monitor";
import { SegmentSwitcher } from "./segment-switcher";

// UI-SPEC §2 — Batch detail / jobs monitor (ORCH-04/05/03). Async Server Component,
// Node runtime (Prisma), force-dynamic so the first paint reflects the latest DB
// state. requireSession() runs FIRST (T-04-10). The batch is IDOR-loaded by
// params.id; a missing one renders the calm inline "Couldn't load this batch."
// (T-04-11). DB-ONLY: this page imports prisma + batch-status ONLY and MUST NOT
// import the GPU dispatch client (ORCH-02; test/orch-db-only.test.ts source guard).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tab title (UX audit B7): NO DB call — the short batch id is enough to tell
// browser tabs apart.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Batch · ${id.slice(0, 8)}` };
}

// Render a job's combo Json into the "view1 · white · diamond · stone" mono string.
// Reads the CANONICAL combo keys (angleKey/metalKey/stoneGroup/pass) the expander
// persists — the old angle/metal/stone keys never existed, so every label used to
// collapse to "render".
function comboLabel(combo: unknown): string {
  if (combo && typeof combo === "object") {
    const c = combo as Record<string, unknown>;
    const parts = [c.angleKey, c.metalKey, c.stoneGroup, c.pass]
      .filter((v) => typeof v === "string" && v.length > 0)
      .map((v) => String(v));
    if (parts.length > 0) return parts.join(" · ");
  }
  return "render";
}

// Pull a single light thumbnail URL from the job's Layer rows (Phase 5 builds the
// full gallery; here we only read a Layer url for the completed-row preview).
// Preference order is the shared full-pass-first contract (lib/gallery/group):
// flattened composite > full beauty pass > first layer.
type JobLayer = { url: string; pass: string; isFlattened: boolean };
function thumbnailOf(layers: JobLayer[]): string | null {
  return preferredPreviewLayer(layers)?.url ?? null;
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const batch = await loadBatch(id);

  if (!batch) {
    return (
      <div className="flex flex-col gap-6">
        <SegmentSwitcher batchId={id} active="monitor" />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load this batch. Check your connection and try again.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <Link href={`/batches/${id}`}>Try again</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/batches">Back to batches</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cancelable = batch.jobs.filter((j) => !isTerminal(j.status)).length;
  const terminalWithFailures =
    cancelable === 0 && batch.progress.failed > 0;

  // INTEL-05: the per-job AI intel views (empty for a classic batch -> panel
  // absent). DB-only — same contract as the rest of this page.
  const intelViews = await loadBatchIntel(batch.id);

  return (
    <div className="flex flex-col gap-8">
      <SegmentSwitcher batchId={batch.id} active="monitor" />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-semibold leading-tight text-foreground">
                {batch.productName}
              </h1>
              <BatchStatusPill status={batch.status} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {batch.id} · {batch.combo}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {cancelable === 0 && batch.progress.completed > 0 ? (
              // Terminal batch with finished renders — the primary next step is
              // viewing what it produced (UX audit A2).
              <Button size="sm" asChild>
                <Link href={`/batches/${batch.id}/gallery`}>
                  <Images className="size-4" />
                  View outputs
                </Link>
              </Button>
            ) : null}
            {terminalWithFailures ? (
              // Manual retry is descoped this phase (UI-SPEC: optional). Auto-retry
              // (Wave 2) already satisfies ORCH-03 via the Attempt column. The link
              // sends the operator back to the product to rebuild a fresh batch.
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/products/${batch.productId}`}>Rebuild from product</Link>
              </Button>
            ) : null}
            <CancelBatchControl batchId={batch.id} cancelableCount={cancelable} />
          </div>
        </div>
      </header>

      {intelViews.length > 0 ? (
        <IntelPanel batchId={batch.id} items={intelViews} />
      ) : null}

      <JobsMonitor batchId={batch.id} initial={batch.snapshot} />
    </div>
  );
}

type LoadedBatch = {
  id: string;
  productId: string;
  productName: string;
  combo: string;
  progress: BatchProgress;
  status: ReturnType<typeof deriveBatchStatus>;
  jobs: { status: MonitorJob["status"] }[];
  snapshot: MonitorSnapshot;
};

async function loadBatch(id: string): Promise<LoadedBatch | null> {
  let batch;
  try {
    batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true } },
        jobs: {
          orderBy: { id: "asc" },
          include: {
            layers: { select: { url: true, pass: true, isFlattened: true } },
          },
        },
      },
    });
  } catch {
    return null;
  }
  if (!batch) return null;

  // Collapse jobs into BatchProgress for the first-paint aggregate + derived status.
  const tally = new Map<string, number>();
  for (const j of batch.jobs) tally.set(j.status, (tally.get(j.status) ?? 0) + 1);
  const progress = summarizeJobs(
    [...tally.entries()].map(([status, count]) => ({
      status: status as MonitorJob["status"],
      _count: count,
    })),
  );
  const status = deriveBatchStatus(progress, batch.cancelRequestedAt);

  const monitorJobs: MonitorJob[] = batch.jobs.map((j) => ({
    id: j.id,
    status: j.status,
    combo: comboLabel(j.combo),
    attempt: j.attempt,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
    error: j.error ?? null,
    thumbnailUrl: thumbnailOf(j.layers),
  }));

  return {
    id: batch.id,
    productId: batch.product?.id ?? batch.productId,
    productName: batch.product?.name ?? "Untitled product",
    combo: comboSummary(batch.matrix, batch.jobCount, progress.total),
    progress,
    status,
    jobs: batch.jobs.map((j) => ({ status: j.status })),
    snapshot: { status, progress, jobs: monitorJobs },
  };
}

function comboSummary(matrix: unknown, jobCount: number, total: number): string {
  const n = total || jobCount;
  if (matrix && typeof matrix === "object") {
    const m = matrix as Record<string, unknown>;
    const metals = arrLen(m.metalKeys);
    const angles = arrLen(m.angleViewKeys ?? m.angleKeys);
    // resolvedPasses (new batches) includes the implicit full beauty pass, so the
    // displayed product matches jobCount; old batches fall back to the raw selection.
    const passes = arrLen(m.resolvedPasses) || arrLen(m.passes);
    if (metals && angles && passes) {
      return `${metals} metals × ${angles} angles × ${passes} passes = ${n} jobs`;
    }
  }
  return `${n} jobs`;
}

function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}
