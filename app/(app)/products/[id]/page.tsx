import { notFound } from "next/navigation";
import { Box } from "lucide-react";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { privateUrl } from "@/lib/blob";
import { parseInventory, type ParsedInventory } from "@/lib/inventory";
import { Badge } from "@/app/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";

import { loadAssignments } from "@/lib/products/assignments";

import { InspectPanel } from "./inspect-panel";
import { GroupAssignment } from "./group-assignment";

// UI-SPEC §3 — Product detail (Overview | Materials | Groups). requireSession()
// first line (T-02-12; an Operator must be authenticated to view a product).
// Node runtime (Prisma); force-dynamic (always reflects the latest poll). The
// thumbnail/model is NEVER a public blob url — it is delivered via the auth-gated
// /api/file proxy (privateUrl, T-02-15).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  needs_inspection: { label: "needs inspection", variant: "outline" },
  inspecting: { label: "inspecting", variant: "secondary" },
  needs_groups: { label: "needs groups", variant: "secondary" },
  ready: { label: "ready", variant: "default" },
  inspection_failed: { label: "inspection failed", variant: "destructive" },
  draft: { label: "draft", variant: "outline" },
};

function formatModelLine(modelUrl: string | null, modelFormat: string | null): string {
  if (!modelUrl) return "No model uploaded";
  const filename = modelUrl.split("/").pop() ?? modelUrl;
  const fmt = modelFormat ? modelFormat.toUpperCase() : "—";
  return `${filename} · ${fmt}`;
}

export default async function ProductDetailPage({
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

  const inspectionRow = await prisma.inspection.findFirst({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
  });

  const parsedInventory: ParsedInventory | null = inspectionRow?.inventory
    ? parseInventory(inspectionRow.inventory)
    : null;

  const inspectionView = inspectionRow
    ? {
        id: inspectionRow.id,
        status: inspectionRow.status,
        error: inspectionRow.error,
        inventory: parsedInventory,
      }
    : null;

  const pill = STATUS_PILL[product.status] ?? { label: product.status, variant: "outline" as const };
  const modelHref = product.modelUrl ? privateUrl(product.modelUrl) : null;

  // Groups tab data: the inspected MESH objects + any already-saved assignments
  // (loadAssignments round-trips a save so revisits restore the operator's groups).
  const groupObjects = parsedInventory?.objects ?? [];
  const initialAssignments = await loadAssignments(id);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            {product.name}
          </h1>
          <Badge variant={pill.variant}>{pill.label}</Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {formatModelLine(product.modelUrl, product.modelFormat)}
        </p>
      </header>

      <Tabs defaultValue="materials" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="flex items-start gap-6 rounded-lg border border-border p-6">
            <div className="flex size-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              {/* Thumbnail (when available) is served via the authed /api/file proxy — never a public url (T-02-15). */}
              <Box className="size-10" strokeWidth={1.25} />
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model</dt>
                <dd className="font-mono text-sm text-foreground">
                  {product.modelUrl ? product.modelUrl.split("/").pop() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format</dt>
                <dd className="font-mono text-sm text-foreground">
                  {product.modelFormat ? product.modelFormat.toUpperCase() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded</dt>
                <dd className="font-mono text-sm text-foreground">
                  {new Date(product.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </dd>
              </div>
              {modelHref ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</dt>
                  <dd>
                    <a className="text-sm text-primary underline-offset-4 hover:underline" href={modelHref}>
                      Download model
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="materials">
          <InspectPanel productId={product.id} inspection={inspectionView} />
        </TabsContent>

        <TabsContent value="groups">
          {groupObjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Assign each object to a group, then save. Available after inspection.
              </p>
            </div>
          ) : (
            <GroupAssignment
              productId={product.id}
              objects={groupObjects}
              initialAssignments={initialAssignments}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
