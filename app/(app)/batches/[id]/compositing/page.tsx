import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { list } from "@vercel/blob";

import { requireSession } from "@/lib/auth/rbac";
import { Button } from "@/app/components/ui/button";
import {
  deriveBatchStatus,
  summarizeJobs,
} from "@/lib/orchestration/batch-status";
import { loadBatchGallery } from "@/lib/gallery/query";
import {
  groupVariantsForCompositing,
  type LayerWithCombo,
} from "@/lib/compositing/variants";
import {
  deliverablePathname,
  deliverablePrefix,
} from "@/lib/compositing/deliverable";
import { PageBreadcrumb } from "@/app/components/app-shell/page-breadcrumb";

import { SegmentSwitcher } from "../segment-switcher";
import { LayerCompositor } from "./compositor";
import { DownloadAllDeliverables } from "./download-all-action";

// COMP-01 — the compositing surface. Async Server Component, Node runtime (Prisma
// + blob list), force-dynamic so the first paint reflects the latest DB + blob
// state. requireSession() runs FIRST (T-06-06). The batch is IDOR-loaded by
// params.id (T-06-07); a missing one renders the calm "Couldn't load" card.
// DB-ONLY: this page imports loadBatchGallery + the PURE compositing/blob helpers
// ONLY and MUST NOT import the GPU dispatch client (test/orch-db-only +
// test/comp-page-db-only source guards cover it). Every preview <img src> resolves
// through the auth-gated /api/file proxy inside the client compositor (T-06-08).
//
// Persistence is BLOB-ONLY (06-01): a flattened deliverable is a private blob at
// renders/<batchId>/deliverables/<angle>_<metal>.png — NOT a Layer row with
// isFlattened=true (that flag stays all-false). The "{d} flattened" count is
// therefore derived from list({prefix:deliverablePrefix(id)}), never from layers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compositing" };

export default async function BatchCompositingPage({
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
        <SegmentSwitcher batchId={id} active="compositing" />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            Couldn&apos;t load this batch for compositing. Check your connection
            and try again.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <Link href={`/batches/${id}/compositing`}>Try again</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/batches">Back to batches</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Group the completed-job Layer rows into compositing variants (angle × metal).
  const rows: LayerWithCombo[] = gallery.layers.map((l) => ({
    id: l.id,
    pass: l.pass,
    url: l.url,
    format: l.format,
    combo: l.combo,
  }));
  const variants = groupVariantsForCompositing(rows);

  // BLOB-DERIVED flattened count. Discover the deliverables that already exist for
  // this batch by prefix, then match them against the enumerated variant deliverable
  // pathnames so the count reflects flattened *variants* (never the all-false
  // Layer.isFlattened flag). A blob list failure degrades to 0 — the page still
  // composes; it never surfaces a GPU dispatch error.
  const flattenedKeys = new Set<string>();
  try {
    const { blobs } = await list({ prefix: deliverablePrefix(id), limit: 1000 });
    const existing = new Set(blobs.map((b) => b.pathname));
    for (const v of variants) {
      const pathname = deliverablePathname(id, v.angleKey, v.metalKey);
      if (existing.has(pathname)) flattenedKeys.add(v.key);
    }
  } catch {
    // Blob list unavailable — count stays 0; compositors still render.
  }

  // Group variants by metal for the section layout (UI-SPEC §Body — variants
  // grouped under each metalKey). First-seen metal order is deterministic.
  const byMetal = new Map<string, typeof variants>();
  for (const v of variants) {
    const metal = v.metalKey ?? "other";
    const bucket = byMetal.get(metal) ?? [];
    bucket.push(v);
    byMetal.set(metal, bucket);
  }

  // Partial-progress banner derived from DB counts only — no GPU dispatch poll.
  const progress = summarizeJobs(
    gallery.jobCounts.map((g) => ({
      status: g.status as never,
      _count: g.count,
    })),
  );
  const batchStatus = deriveBatchStatus(progress);
  const partial = batchStatus !== "completed" && progress.total > 0;

  return (
    <div className="flex flex-col gap-8">
      <PageBreadcrumb
        items={[
          { label: "Batches", href: "/batches" },
          { label: gallery.productName, href: `/batches/${gallery.id}` },
          { label: "Compositing" },
        ]}
      />

      <SegmentSwitcher batchId={id} active="compositing" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            {gallery.productName} ·{" "}
            <span className="font-mono">{gallery.id}</span> — Compositing
          </h1>
          <span className="font-mono text-xs text-muted-foreground">
            {variants.length} variants · {flattenedKeys.size} flattened
          </span>
        </div>
        {/* COMP-03 — the one primary action per view. flattenedCount is
            BLOB-DERIVED (flattenedKeys, from deliverablePrefix list) so empty-scope
            disables correctly under blob-only persistence (06-01). */}
        <DownloadAllDeliverables
          batchId={gallery.id}
          flattenedCount={flattenedKeys.size}
        />
      </header>

      {partial ? (
        <div className="rounded-lg border border-info/40 bg-info/10 p-4 text-sm text-foreground">
          {progress.completed} of {progress.total} renders done — more variants
          will become composable as jobs finish.
        </div>
      ) : null}

      {variants.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Layers className="size-5" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">
              No composable layers yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This batch hasn&apos;t produced any finished layers to composite yet.
              Check its progress in the monitor.
            </p>
          </div>
          <Button variant="secondary" className="mt-2" asChild>
            <Link href={`/batches/${gallery.id}`}>View batch progress</Link>
          </Button>
        </div>
      ) : (
        [...byMetal.entries()].map(([metal, group], gi) => (
          <section
            key={metal}
            className={gi > 0 ? "mt-6 flex flex-col gap-6" : "flex flex-col gap-6"}
          >
            <h2 className="text-base font-semibold text-foreground">
              <span className="font-mono">{metal}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {group.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {group.map((variant) => (
                <LayerCompositor
                  key={variant.key}
                  batchId={gallery.id}
                  variant={variant}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
