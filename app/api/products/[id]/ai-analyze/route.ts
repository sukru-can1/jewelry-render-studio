import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { parseInventory } from "@/lib/inventory";
import { aiClassifyInventory } from "@/lib/inspection/ai-classify";
import type { ObjectGroupKey } from "@/lib/validation/product";

// AI auto-grouping (additive). requireSession() FIRST (fail-closed), load the
// product's latest inspection inventory, ask the AI model to classify it, then map
// each AI assignment back to the object's signature so the Groups tab can pre-fill
// the operator's selection. NEVER auto-saves — the operator reviews + Saves.
//
// gpt-5.5-pro is a slow reasoning model: this route needs headroom well past the
// default 60s Vercel cap, hence maxDuration = 300. A path-specific entry in
// vercel.json (more specific than the `app/api/**/*.ts` glob) preserves this in
// production.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await params;

  const inspection = await prisma.inspection.findFirst({
    where: { productId: id },
    orderBy: { createdAt: "desc" },
  });

  const inventory = inspection?.inventory ? parseInventory(inspection.inventory) : null;
  if (!inventory || inventory.objects.length === 0) {
    return NextResponse.json(
      { error: "No inspection inventory to analyze. Run material inspection first." },
      { status: 400 },
    );
  }

  let analysis;
  try {
    analysis = await aiClassifyInventory(inventory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analysis failed.";
    // A missing key is a configuration (client-actionable) error → 400; any other
    // failure (model/network) is a 500. Error shape matches the route convention.
    const notConfigured = message.includes("not configured");
    return NextResponse.json(
      { ok: false, error: message },
      { status: notConfigured ? 400 : 500 },
    );
  }

  // Map each AI assignment back to the object's signature (the Groups tab keys its
  // selection by signature). Match by exact object name; drop "other" so helper /
  // non-jewelry meshes are never routed into a render group.
  const byName = new Map(inventory.objects.map((o) => [o.name, o]));
  const groupsBySignature: Record<string, ObjectGroupKey> = {};
  for (const assignment of analysis.assignments) {
    if (assignment.group === "other") continue;
    const obj = byName.get(assignment.name);
    if (!obj) continue;
    groupsBySignature[obj.signature] = assignment.group;
  }

  return NextResponse.json({
    ok: true,
    groupsBySignature,
    assignments: analysis.assignments,
    scaleAnomalies: analysis.scaleAnomalies,
    warnings: analysis.warnings,
    summary: analysis.summary,
  });
}
