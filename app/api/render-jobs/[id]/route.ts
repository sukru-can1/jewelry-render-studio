import { getJob, saveJob } from "@/lib/jobs";
import { getRunPodStatus } from "@/lib/runpod";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Render job not found" }, { status: 404 });

  if (job.runpodJobId && !["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    const status = await getRunPodStatus(job.runpodJobId);
    job.status = status.status || job.status;
    job.result = status;
    if (job.status === "FAILED") {
      job.error = String(status.error || status.output || "RunPod job failed");
    }
    return NextResponse.json(await saveJob(job));
  }

  return NextResponse.json(job);
}

