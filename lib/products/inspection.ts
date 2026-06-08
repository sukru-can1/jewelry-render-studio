"use server";

// PROD-02 — material inspection Server Actions (decision #1 worker-readable
// private model URL; decision #3 dedicated Inspection row + on-demand poll, no
// Phase-4 webhook). startInspection dispatches the existing RunPod
// "inspect_materials" operation; pollInspection reads the resulting inventory
// sidecar PRIVATELY by pathname and parses it.
//
// SEC-02: the worker writes the sidecar with access=BLOB_ACCESS (handler.py
// defaults to "public" — the RunPod endpoint MUST set BLOB_ACCESS=private, see
// the plan user_setup). Regardless, we read it via the @vercel/blob server SDK
// get(inventory_key, { access:'private' }) — never via the public inventory_url.

import { randomUUID } from "node:crypto";

import { get } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import type { Prisma } from "@prisma/client";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { workerModelUrl } from "@/lib/blob";
import { parseInventory } from "@/lib/inventory";
import { getRunPodStatus, submitRunPod } from "@/lib/runpod";

type ActionResult = { ok: boolean };

/**
 * Dispatch the RunPod inspect_materials operation for a product's model.
 *
 * - requireSession() first (T-02-12, fail-closed).
 * - Mints a worker-readable signed-GET URL for the PRIVATE model (the worker's
 *   requests.get is unauthenticated and cannot use /api/file — decision #1).
 * - The dispatched `job_id` is an app-minted WORKER key (handler.py keys the
 *   sidecar at `{prefix}/{job_id}_material_inventory.json`). The persisted
 *   `runpodJobId` is the RunPod job id (submitRunPod().id) used for polling —
 *   these are intentionally DISTINCT.
 */
export async function startInspection(productId: string): Promise<ActionResult> {
  await requireSession();

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.modelUrl) {
    return { ok: false };
  }

  // Decision #1: mint a tokenless worker-readable GET URL for the private model.
  const workerUrl = await workerModelUrl(product.modelUrl);

  // WORKER key — distinct from the RunPod job id. handler.py requires job_id and
  // uses it (with output.prefix) to compute the deterministic sidecar pathname.
  const workerKey = randomUUID();

  const res = (await submitRunPod({
    operation: "inspect_materials",
    job_id: workerKey,
    output: { prefix: `inspections/${productId}` },
    model: { url: workerUrl, pathname: product.modelUrl },
  })) as { id: string };

  // Persist the RUNPOD job id (for getRunPodStatus polling) — NOT the worker key.
  await prisma.inspection.create({
    data: { productId, runpodJobId: res.id, status: "in_queue" },
  });

  await prisma.product.update({
    where: { id: productId },
    data: { status: "inspecting" },
  });

  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

/**
 * Poll a single inspection's RunPod job and reconcile the Inspection row.
 *
 * On COMPLETED, read the inventory sidecar by PATHNAME (status.output.inventory_key)
 * via the private @vercel/blob server SDK get() — never a public inventory_url
 * fetch (SEC-02) — then parseInventory and persist. Maps FAILED and the in-flight
 * statuses defensively. Never depends on a Phase-4 webhook (decision #3).
 */
export async function pollInspection(inspectionId: string): Promise<ActionResult> {
  await requireSession();

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
  });
  if (!inspection || !inspection.runpodJobId) {
    return { ok: false };
  }

  const status = (await getRunPodStatus(inspection.runpodJobId)) as {
    status: string;
    output?: Record<string, unknown>;
    error?: string;
  };
  const output = (status.output ?? {}) as Record<string, unknown>;

  if (status.status === "COMPLETED") {
    const inventoryKey = typeof output.inventory_key === "string" ? output.inventory_key : null;
    let inventory: ReturnType<typeof parseInventory> | null = null;

    if (inventoryKey) {
      // SEC-02: private read by PATHNAME. Do NOT fetch output.inventory_url.
      const blob = await get(inventoryKey, { access: "private" });
      if (blob && blob.statusCode === 200) {
        const raw = await new Response(blob.stream).json();
        inventory = parseInventory(raw);
      }
    }

    await prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        status: "completed",
        // ParsedInventory is a plain JSON-serializable object; cast to Prisma's
        // JSON input type (it lacks a string index signature ParsedInventory misses).
        inventory: (inventory ?? undefined) as Prisma.InputJsonValue | undefined,
        finishedAt: new Date(),
      },
    });
    await prisma.product.update({
      where: { id: inspection.productId },
      data: { status: "needs_groups" },
    });
  } else if (status.status === "FAILED") {
    const rawError =
      (typeof output.error === "string" && output.error) ||
      (typeof status.error === "string" && status.error) ||
      "The render worker reported an error.";
    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { status: "failed", error: rawError.slice(0, 2000), finishedAt: new Date() },
    });
    await prisma.product.update({
      where: { id: inspection.productId },
      data: { status: "inspection_failed" },
    });
  } else {
    // IN_QUEUE / IN_PROGRESS (or unknown) — update status only, no inventory write.
    const mapped = status.status === "IN_PROGRESS" ? "in_progress" : "in_queue";
    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { status: mapped },
    });
  }

  revalidatePath(`/products/${inspection.productId}`);
  return { ok: true };
}
