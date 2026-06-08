import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";

export const runtime = "nodejs";

// SEC-02 (RESEARCH Pitfall 4): this client-upload token route previously minted
// write tokens to ANY caller. `onBeforeGenerateToken` now runs `requireSession()`
// as its first line, so an unauthenticated POST gets a 401 and NO token is issued.
// allowedContentTypes stays restricted to the model/image/json set the product
// needs (per CONCERNS — never leave it wide open).
const allowedContentTypes = [
  "application/octet-stream", // .blend / .stl / .obj (generic binary models)
  "application/x-fbx",
  "application/vnd.autodesk.fbx",
  "model/fbx",
  "model/gltf-binary", // .glb
  "model/gltf+json", // .gltf
  "application/json", // render recipes / metadata sidecars
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // AUTH BOUNDARY — first line, before any token config is produced.
        // requireSession() throws a 401 Response for unauthenticated callers,
        // which surfaces through the catch below (no token is minted).
        await requireSession();
        return {
          // SEC-02 (T-02-02): mint PRIVATE tokens. Without this, Vercel defaults
          // the token to PUBLIC and model blobs leak by URL. Private blobs are
          // delivered only via the auth-gated GET /api/file proxy.
          access: "private",
          allowedContentTypes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("Blob upload completed", blob.pathname);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    // Surface the auth 401 distinctly; everything else is a 400 token failure.
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload token failed" },
      { status: 400 },
    );
  }
}
