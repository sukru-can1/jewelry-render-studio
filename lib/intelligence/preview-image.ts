// INTEL-02 (Phase 9, T-09-05) — private preview bytes for the vision call.
//
// The completed preview render is a PRIVATE Vercel Blob. The vision model can
// never be handed a URL to it: there is no signed-delivery scheme for private
// blobs, and the auth-gated file-proxy route requires a browser session the
// server-side analyzer does not have. So we read the bytes directly with
// get(pathname,{access:'private'}) — the SAME call that proxy uses — then
// downscale to ~768px (the model judges lighting/framing, not facets; A3 in
// 09-AI-RESEARCH §2 — imageDetail:"low" caps the token cost at this size), and
// inline the result as a base64 data URL content part.
//
// Server-only: imports @vercel/blob + sharp. Never import from client code.

import { get } from "@vercel/blob";
import sharp from "sharp";

/**
 * Fetch a PRIVATE preview blob and return it as a ~768px base64 PNG data URL.
 *
 * Throws "preview blob missing" when the blob does not exist (get() returns
 * null) or the read is not a 200-with-body — the caller treats that as an
 * unanalyzable preview (escalate, never loop).
 */
export async function previewDataUrl(pathname: string): Promise<string> {
  const res = await get(pathname, { access: "private" });
  if (!res || res.statusCode !== 200) {
    throw new Error("preview blob missing");
  }

  const raw = Buffer.from(await new Response(res.stream).arrayBuffer());

  // Downscale to bound image tokens (~1920px render -> <=768px long edge).
  const png = await sharp(raw)
    .resize({ width: 768, height: 768, fit: "inside" })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}
