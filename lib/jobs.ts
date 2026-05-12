import { list, put } from "@vercel/blob";
import { randomUUID } from "crypto";
import type { BlobAsset, RenderJob } from "./types";

const JOB_PREFIX = "app-state/render-jobs";

function now() {
  return new Date().toISOString();
}

function jobPath(id: string) {
  return `${JOB_PREFIX}/${id}.json`;
}

export function createJob(input: {
  model: BlobAsset;
  referenceImage?: BlobAsset | null;
  recipe: Record<string, unknown>;
  outputPrefix?: string;
}): RenderJob {
  const id = randomUUID();
  const baseName = input.model.pathname.split("/").pop()?.replace(/\.[^.]+$/, "") || id;
  const timestamp = now();
  return {
    id,
    status: "queued",
    model: input.model,
    referenceImage: input.referenceImage || null,
    recipe: input.recipe,
    outputPrefix: input.outputPrefix || `outputs/${baseName}/${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    result: null,
    error: null
  };
}

export async function saveJob(job: RenderJob) {
  const updated = { ...job, updatedAt: now() };
  await put(jobPath(job.id), JSON.stringify(updated, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true
  });
  return updated;
}

export async function getJob(id: string) {
  const url = `${process.env.BLOB_PUBLIC_BASE_URL || ""}/${jobPath(id)}`;
  if (process.env.BLOB_PUBLIC_BASE_URL) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as RenderJob;
  }

  const result = await list({ prefix: jobPath(id), limit: 1 });
  const blob = result.blobs[0];
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as RenderJob;
}

export async function listJobs() {
  const result = await list({ prefix: `${JOB_PREFIX}/`, limit: 1000 });
  const jobs = await Promise.all(
    result.blobs.map(async (blob) => {
      const response = await fetch(blob.url, { cache: "no-store" });
      return response.ok ? ((await response.json()) as RenderJob) : null;
    })
  );
  return jobs
    .filter((job): job is RenderJob => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
