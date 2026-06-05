import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedContentTypes = [
  "application/octet-stream",
  "application/x-fbx",
  "application/vnd.autodesk.fbx",
  "model/gltf-binary",
  "model/gltf+json",
  "model/fbx",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp"
];

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname })
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("Blob upload completed", blob.pathname);
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload token failed" }, { status: 400 });
  }
}
