import { createJob, saveJob } from "@/lib/jobs";
import { submitRunPod } from "@/lib/runpod";
import type { BlobAsset } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { model: BlobAsset };
    const job = createJob({
      model: body.model,
      recipe: { operation: "inspect_materials" },
      outputPrefix: `material-inspections/${body.model.pathname.split("/").pop()?.replace(/\.[^.]+$/, "") || "model"}/${crypto.randomUUID()}`
    });

    const submitted = await submitRunPod({
      operation: "inspect_materials",
      job_id: job.id,
      model: job.model,
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inspection submit failed" }, { status: 500 });
  }
}

