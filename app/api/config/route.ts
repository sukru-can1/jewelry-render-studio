import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    runpodApiConfigured: Boolean(process.env.RUNPOD_API_KEY),
    runpodEndpointConfigured: Boolean(process.env.RUNPOD_ENDPOINT_ID)
  });
}

