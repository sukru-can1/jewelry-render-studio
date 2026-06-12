import type { Metadata } from "next";
import Link from "next/link";
import { Box, Layers } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/app/components/ui/button";
import {
  deriveBatchStatus,
  summarizeJobs,
  type BatchProgress,
} from "@/lib/orchestration/batch-status";
import { relativeTime } from "@/lib/format";

import { AggregateBar } from "./aggregate-bar";
import { BatchStatusPill } from "./status-pill";

// UI-SPEC §1 — Batches list (ORCH-04). Async Server Component, Node runtime
// (Prisma), force-dynamic so the list always reflects the latest DB state.
// requireSession() runs FIRST (T-04-10 — defense-in-depth alongside the layout
// gate). DB-ONLY: this page reads Postgres only and MUST NOT import the GPU
// dispatch client (ORCH-02; enforced by test/orch-db-only.test.ts source guard).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Batches" };

const EMPTY_BODY =
  "Build a batch from a product to start rendering. It'll show up here with live progress.";

type BatchRow = {
  id: string;
  productName: string;
  combo: string;
  progress: BatchProgress;
  status: ReturnType<typeof deriveBatchStatus>;
  createdAt: Date;
};

export default async function BatchesPage() {
  await requireSession();

  let batches: BatchRow[] | null = null;
  let loadError = false;
  try {
    batches = await loadBatches();
  } catch {
    loadError = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            Batches
          </h1>
          {batches ? (
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {batches.length}
            </span>
          ) : null}
        </div>
        <Button variant="secondary" asChild>
          <Link href="/products">Build a batch</Link>
        </Button>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load batches. Check your connection and try again.
          </p>
          <Button variant="secondary" className="mt-4" asChild>
            <Link href="/batches">Retry</Link>
          </Button>
        </div>
      ) : batches && batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">No batches yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">{EMPTY_BODY}</p>
          </div>
          <Button asChild className="mt-2">
            <Link href="/products">Go to products</Link>
          </Button>
        </div>
      ) : batches ? (
        <div className="flex flex-col gap-3">
          {batches.map((b) => (
            <BatchRowCard key={b.id} batch={b} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BatchRowCard({ batch }: { batch: BatchRow }) {
  return (
    <Link
      href={`/batches/${batch.id}`}
      className="group/link rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors group-hover/link:border-foreground/20 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Box className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold text-foreground">
            {batch.productName}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {batch.combo}
          </span>
        </div>
        <div className="w-full sm:w-56">
          <AggregateBar progress={batch.progress} compact />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <BatchStatusPill status={batch.status} />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {relativeTime(batch.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// recency-sorted batches with the per-batch job-status counts. One findMany with
// the jobs' status pulled in, then summarized in-process — DB-only, no GPU calls.
async function loadBatches(): Promise<BatchRow[]> {
  const rows = await prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { name: true } },
      jobs: { select: { status: true } },
    },
  });

  return rows.map((batch) => {
    // Collapse this batch's jobs into a groupBy-shaped array for summarizeJobs.
    const tally = new Map<string, number>();
    for (const j of batch.jobs) {
      tally.set(j.status, (tally.get(j.status) ?? 0) + 1);
    }
    const progress = summarizeJobs(
      [...tally.entries()].map(([status, count]) => ({
        status: status as (typeof batch.jobs)[number]["status"],
        _count: count,
      })),
    );

    return {
      id: batch.id,
      productName: batch.product?.name ?? "Untitled product",
      combo: comboSummary(batch.matrix, batch.jobCount, progress.total),
      progress,
      status: deriveBatchStatus(progress, batch.cancelRequestedAt),
      createdAt: batch.createdAt,
    };
  });
}

// "{m} metals × {a} angles × {p} passes = {N} jobs" from Batch.matrix; falls
// back to the job count when the matrix shape is absent.
function comboSummary(
  matrix: unknown,
  jobCount: number,
  total: number,
): string {
  const n = total || jobCount;
  if (matrix && typeof matrix === "object") {
    const m = matrix as Record<string, unknown>;
    const metals = arrLen(m.metalKeys);
    const angles = arrLen(m.angleViewKeys ?? m.angleKeys);
    const passes = arrLen(m.passes);
    if (metals && angles && passes) {
      return `${metals} metals × ${angles} angles × ${passes} passes = ${n} jobs`;
    }
  }
  return `${n} jobs`;
}

function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}
