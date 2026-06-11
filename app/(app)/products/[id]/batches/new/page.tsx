import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { loadAssignments } from "@/lib/products/assignments";
import {
  isBuildable,
  presentStoneGroups,
  supportedStoneTypes,
} from "@/lib/batches/builder-data";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";

import { BatchBuilder } from "./batch-builder";

// UI-SPEC §1 (surface 1) — the Batch Builder. requireSession() FIRST line (T-03-12;
// the page is reachable by URL for ANY product id, so auth is enforced here AND the
// createBatch action re-checks IDOR + readiness regardless of what rendered). Node
// runtime (Prisma); force-dynamic so the live Admin-editable domain is always fresh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function NewBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { assignments: true },
  });
  if (!product) {
    notFound();
  }

  // No-assignment / not-ready guard (RESEARCH Pitfall 6): a product without a saved
  // group assignment (or not yet "ready") cannot be fanned out — render the centered
  // empty state and DO NOT assemble or render any selectors.
  const buildable = isBuildable(product.status, product.assignments.length);
  if (!buildable) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
          <Layers className="size-6" strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          This product isn&apos;t ready for a batch
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Assign its parts to groups first — that&apos;s what tells each render which
          parts to show or hold out.
        </p>
        <Button asChild variant="secondary">
          <Link href={`/products/${product.id}`}>Go to groups</Link>
        </Button>
      </div>
    );
  }

  // Buildable: load the live Admin-editable domain in parallel + the saved assignment.
  const [cameraViews, metals, stoneTypes, qualityPresets, assignments] =
    await Promise.all([
      prisma.cameraView.findMany({ orderBy: { key: "asc" } }),
      prisma.metal.findMany({ orderBy: { key: "asc" } }),
      prisma.stoneType.findMany({ orderBy: { key: "asc" } }),
      prisma.qualityPreset.findMany({ orderBy: { samples: "asc" } }),
      loadAssignments(id),
    ]);

  const present = presentStoneGroups(assignments);
  const supportedTypes = supportedStoneTypes(
    stoneTypes.map((s) => ({ key: s.key, label: s.label })),
  );

  // INTEL-05 / G9: the "Optimize with AI" toggle is enabled only when the
  // feature is configured server-side (key present + global kill-switch not
  // "false"). Display-only — createBatch re-gates regardless of the client flag.
  const aiConfigured =
    Boolean(env.OPENAI_API_KEY) && env.ADAPTIVE_INTELLIGENCE_ENABLED !== "false";

  return (
    <div className="flex flex-col gap-8 pb-28 lg:pb-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            Build batch
          </h1>
          <Badge variant="default">{product.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{product.name}</p>
      </header>

      <BatchBuilder
        productId={product.id}
        cameraViews={cameraViews.map((c) => ({
          key: c.key,
          label: c.label,
          azimuth: c.azimuth,
          elevation: c.elevation,
        }))}
        metals={metals.map((m) => ({
          key: m.key,
          label: m.label,
          hex: m.hex ?? null,
        }))}
        stoneTypes={supportedTypes}
        qualityPresets={qualityPresets.map((q) => ({
          key: q.key,
          label: q.label,
          samples: q.samples,
          width: q.width,
          height: q.height,
        }))}
        presentStoneGroups={present}
        aiConfigured={aiConfigured}
      />
    </div>
  );
}
