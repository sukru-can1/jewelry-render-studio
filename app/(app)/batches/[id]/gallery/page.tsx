import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { Button } from "@/app/components/ui/button";
import {
  deriveBatchStatus,
  summarizeJobs,
} from "@/lib/orchestration/batch-status";
import { loadBatchGallery } from "@/lib/gallery/query";
import { PageBreadcrumb } from "@/app/components/app-shell/page-breadcrumb";

import { BatchStatusPill } from "../../status-pill";
import { SegmentSwitcher } from "../segment-switcher";
import { GalleryBody } from "./gallery-controls";
import type { GalleryCardLayer } from "./layer-card";

// OUT-02/03 — the outputs gallery. Async Server Component, Node runtime (Prisma),
// force-dynamic so the first paint reflects the latest DB state. requireSession()
// runs FIRST (T-05-04). The batch is IDOR-loaded by params.id (T-05-06); a missing
// one renders the calm inline "Couldn't load these outputs." DB-ONLY: this page
// imports loadBatchGallery + batch-status ONLY and MUST NOT import the GPU dispatch
// client (T-05-09; test/orch-db-only.test.ts source guard covers it). Every <img
// src> resolves through the auth-gated /api/file proxy (T-05-07) inside the cards.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Outputs" };

export default async function BatchGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const gallery = await loadBatchGallery(id);

  if (!gallery) {
    return (
      <div className="flex flex-col gap-6">
        <SegmentSwitcher batchId={id} active="gallery" />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load these outputs. Check your connection and try again.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <Link href={`/batches/${id}/gallery`}>Try again</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/batches">Back to batches</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const layers: GalleryCardLayer[] = gallery.layers.map((l) => ({
    id: l.id,
    jobId: l.jobId,
    pass: l.pass,
    format: l.format,
    url: l.url,
    combo: l.combo,
  }));

  // Partial-progress banner derived from DB counts only — no GPU dispatch poll.
  const progress = summarizeJobs(
    gallery.jobCounts.map((g) => ({
      status: g.status as never,
      _count: g.count,
    })),
  );
  const batchStatus = deriveBatchStatus(progress);
  const partial = batchStatus !== "completed" && progress.total > 0;

  const downloadSetHref = `/batches/${gallery.id}/download`;

  return (
    <div className="flex flex-col gap-8">
      <PageBreadcrumb
        items={[
          { label: "Batches", href: "/batches" },
          { label: gallery.productName, href: `/batches/${gallery.id}` },
          { label: "Outputs" },
        ]}
      />

      <SegmentSwitcher batchId={gallery.id} active="gallery" />

      {/* C10 — header hierarchy matches batch detail: product name + status
          pill, mono id sub-line; "Outputs" context comes from the switcher. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-semibold leading-tight text-foreground">
              {gallery.productName}
            </h1>
            <BatchStatusPill status={batchStatus} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {gallery.id} · {layers.length} layers
          </span>
        </div>
        {layers.length > 0 ? (
          <Button asChild>
            <a href={downloadSetHref}>Download full set</a>
          </Button>
        ) : null}
      </header>

      {partial ? (
        <div className="rounded-lg border border-info/40 bg-info/10 p-4 text-sm text-foreground">
          {progress.completed} of {progress.total} renders done — more outputs
          will appear here as jobs finish.
        </div>
      ) : null}

      {layers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Images className="size-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">
              No finished outputs yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Outputs will appear here as renders finish.
            </p>
          </div>
          <Button variant="secondary" asChild className="mt-2">
            <Link href={`/batches/${gallery.id}`}>Back to job monitor</Link>
          </Button>
        </div>
      ) : (
        <GalleryBody layers={layers} downloadSetHref={downloadSetHref} />
      )}
    </div>
  );
}
