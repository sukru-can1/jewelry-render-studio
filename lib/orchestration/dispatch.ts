// ORCH-01 — the 60s-safe chunked cron dispatcher.
//
// A Vercel cron tick claims a bounded chunk of `queued` jobs and submits each to
// RunPod with its recipe + an ABSOLUTE webhook callback URL carrying the secret.
// The Vercel 60s function cap makes a synchronous fan-out of a 48-job batch
// impossible (RESEARCH Pattern 1) — bounding the per-tick chunk is the only
// correct site. Two safety invariants drive the shape of this module:
//
//  A5 — resolve a valid https base URL BEFORE claiming/submitting. The webhook is
//  the PRIMARY status path; a `https://undefined` callback would silently kill all
//  status updates, so we refuse to submit (and release any claimed job) rather
//  than build a broken URL.
//
//  Pitfall 4 — claim each job OPTIMISTICALLY via updateMany where status:'queued';
//  a losing concurrent tick gets count===0 and skips, so the same job is never
//  double-submitted.

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { env, resolveAppBaseUrl } from "@/lib/env";
import { workerModelUrl } from "@/lib/blob";
import {
  isMasterSceneRecipe,
  MASTER_SCENE_BLOB_PATH,
} from "@/lib/master-scene-recipes";
import { submitRunPod } from "@/lib/runpod";

import type { Prisma } from "@prisma/client";

// Bounded per-tick fan-out: the whole tick stays well under the Vercel 60s cap.
const CHUNK = 10;

export type DispatchResult = { claimed: number; dispatched: number };

/**
 * Claim and submit one bounded chunk of queued jobs to RunPod.
 *
 * Resolves the absolute webhook base URL FIRST (A5). If no valid https origin
 * resolves, it does NOT claim or submit any job and returns early — queued jobs
 * stay queued and retry on the next tick once the env is fixed.
 */
export async function dispatchQueuedJobs(): Promise<DispatchResult> {
  // A5: resolve + validate the absolute https base. The webhook is the PRIMARY
  // status path — a broken `https://undefined` callback would strand jobs in
  // 'submitted' forever. We resolve here so a null base short-circuits the submit
  // for every claimed job and releases it back to 'queued' (below), never calling
  // submitRunPod with a broken callback URL.
  const base = resolveAppBaseUrl();

  // The secret travels in the query string because RunPod's webhook field is a
  // plain URL and cannot carry a custom header (A1/A5). RUNPOD_WEBHOOK_SECRET is
  // the SAME name the webhook route checks — build and check sides MUST match.
  const webhookUrl = base
    ? `${base}/api/webhooks/runpod?s=${encodeURIComponent(env.RUNPOD_WEBHOOK_SECRET)}`
    : null;

  const candidates = await prisma.job.findMany({
    where: { status: "queued", batch: { cancelRequestedAt: null } },
    include: { batch: { include: { product: true } } },
    take: CHUNK,
    orderBy: { id: "asc" },
  });

  let claimed = 0;
  let dispatched = 0;

  for (const job of candidates) {
    // Defense-in-depth: re-check the cancel flag on the included batch (the
    // findMany filter already excludes cancelled batches, but a job loaded with a
    // cancelled batch must never be submitted).
    if (job.batch?.cancelRequestedAt) continue;

    // Optimistic claim (Pitfall 4): only the tick that flips 'queued'→'submitted'
    // (count===1) owns the job; a losing concurrent tick gets count===0 and skips.
    const claim = await prisma.job.updateMany({
      where: { id: job.id, status: "queued" },
      data: { status: "submitted", submittedAt: new Date() },
    });
    if (claim.count !== 1) continue;
    claimed += 1;

    // A5 gate AFTER claim: if no valid https base resolved we must NOT submit a
    // broken callback URL — release the just-claimed job back to 'queued' so it
    // retries on a later tick once the env is fixed.
    if (!webhookUrl) {
      console.error(
        "dispatch: no valid APP_URL/VERCEL_PROJECT_PRODUCTION_URL — releasing job",
        job.id,
      );
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "queued", submittedAt: null },
      });
      continue;
    }

    try {
      // Mint a tokenless worker-readable GET URL for the PRIVATE model (decision
      // #1) only when the product carries one; the worker downloads it unauthed.
      const modelUrl = job.batch?.product?.modelUrl;
      const model = modelUrl
        ? { url: await workerModelUrl(modelUrl), pathname: modelUrl }
        : undefined;

      // job_id is the WORKER key (worker uses it only for the output prefix, A6);
      // the persisted runpodJobId is RunPod's RETURNED id (distinct ids, Pitfall 2).
      const input: Record<string, unknown> = {
        operation: "render",
        job_id: job.id,
        recipe: job.recipe ?? {},
        output: { prefix: `renders/${job.id}` },
        webhook: webhookUrl,
      };
      if (model) input.model = model;

      // Master-scene pipeline: a recipe carrying master_scene.enabled renders
      // INSIDE the human-authored studio .blend (v203 quality road). Mint a
      // fresh presigned GET for the PRIVATE studio file per submit — same
      // tokenless-worker-download contract as the model URL above.
      if (isMasterSceneRecipe(job.recipe)) {
        input.master_scene = {
          url: await workerModelUrl(MASTER_SCENE_BLOB_PATH),
          pathname: MASTER_SCENE_BLOB_PATH,
        };
      }

      const res = (await submitRunPod(input)) as { id: string };

      await prisma.job.update({
        where: { id: job.id },
        data: { runpodJobId: res.id, status: "in_queue" },
      });
      dispatched += 1;
    } catch (error) {
      // Release the claimed job back to 'queued' so a later tick retries it;
      // never leave it stranded in 'submitted' with no RunPod job.
      console.error(`dispatch: submit failed for job ${job.id}`, error);
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "queued", submittedAt: null },
      });
    }
  }

  if (dispatched > 0) revalidatePath("/batches");

  return { claimed, dispatched };
}

// Re-export the Prisma JSON type marker for callers that build recipe payloads.
export type DispatchRecipe = Prisma.InputJsonValue;
