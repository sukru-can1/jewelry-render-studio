import { createJob, listJobs, saveJob } from "@/lib/jobs";
import { getRunPodStatus, submitRunPod } from "@/lib/runpod";
import type { BlobAsset } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const jobs = await listJobs();
  const updated = await Promise.all(
    jobs.map(async (job) => {
      if (!job.runpodJobId || ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;
      try {
        const status = await getRunPodStatus(job.runpodJobId);
        job.status = status.status || job.status;
        job.result = status;
        if (job.status === "FAILED") {
          job.error = String(status.error || status.output || "RunPod job failed");
        }
        return saveJob(job);
      } catch {
        return job;
      }
    })
  );
  return NextResponse.json(updated);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      model: BlobAsset;
      referenceImage?: BlobAsset | null;
      recipe: Record<string, unknown>;
    };
    const job = createJob(body);
    const submitted = await submitRunPod({
      operation: "render",
      job_id: job.id,
      model: job.model,
      reference_image: job.referenceImage,
      recipe: job.recipe,
      output: {
        provider: "vercel_blob",
        prefix: job.outputPrefix,
        access: "public"
      }
    });

    job.runpodJobId = submitted.id || submitted.jobId;
    job.status = "submitted";
    job.result = { runpodSubmit: submitted };
    return NextResponse.json(await saveJob(job));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Render submit failed" }, { status: 500 });
  }
}
