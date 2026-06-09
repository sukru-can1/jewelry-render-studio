// COMP-02 — sharp orchestration at the edge. This is the ONLY module that imports
// `sharp`. Given a Variant (from variants.ts) and a private-byte fetcher (the route
// supplies get(private)→Buffer), it:
//   1. fetches base + each overlay Buffer (never a remote/public URL — SEC-02),
//   2. reads sharp metadata()/stats() and hands the PLAIN NUMBERS to validateVariant,
//   3. on gate PASS composites base.composite([overlays], blend:"over").png()→Buffer,
//   4. on gate FAIL returns {ok:false, warnings} and composites NOTHING.
//
// One variant at a time (a handful of layers) keeps memory + the 60s budget safe.

import sharp from "sharp";

import type { Variant, CompositingLayer } from "@/lib/compositing/variants";
import { validateVariant, type FlattenWarning } from "@/lib/compositing/validate";

export type FlattenResult =
  | { ok: true; deliverable: { format: string; width: number; height: number }; buffer: Buffer }
  | { ok: false; warnings: FlattenWarning[] };

/** Fetches a private layer's bytes as a Buffer. The route injects the @vercel/blob
 *  get(private)→stream→Buffer implementation; flatten.ts stays I/O-agnostic. */
export type LayerFetcher = (layer: CompositingLayer) => Promise<Buffer>;

export type FlattenOptions = {
  /** Allow a base-only flatten when the variant has no overlays (?force=1). */
  force?: boolean;
  /** Minimum alpha mean (0..255) below which an overlay counts as empty. */
  minAlphaMean?: number;
};

/** Alpha stats read from a sharp().stats() result; channels[3] is alpha for RGBA. */
function alphaOf(stats: { channels?: { max?: number; mean?: number }[]; isOpaque?: boolean }) {
  const alpha = stats.channels?.[3];
  if (alpha && typeof alpha.max === "number" && typeof alpha.mean === "number") {
    return { alphaMax: alpha.max, alphaMean: alpha.mean };
  }
  // No alpha channel → fully opaque (max coverage). isOpaque is the fast shortcut.
  return { alphaMax: 255, alphaMean: 255 };
}

/**
 * Flatten one variant. Returns {ok:false, warnings} (never throws) when the gate
 * blocks, so the route can answer 200 with the warning panel and write nothing.
 */
export async function flattenVariant(
  variant: Variant,
  fetchLayer: LayerFetcher,
  opts: FlattenOptions = {},
): Promise<FlattenResult> {
  // No base → cannot composite. Hand the gate the missing base so it WARNs.
  if (!variant.base) {
    const warnings = validateVariant({
      overlays: variant.overlays.map((o) => ({ stoneGroup: o.stoneGroup, width: 0, height: 0, alphaMax: 255, alphaMean: 255 })),
      minAlphaMean: opts.minAlphaMean,
    });
    return { ok: false, warnings };
  }

  // Fetch + measure the base.
  const baseBuf = await fetchLayer(variant.base);
  const baseMeta = await sharp(baseBuf).metadata();
  const baseWidth = baseMeta.width ?? 0;
  const baseHeight = baseMeta.height ?? 0;

  // Fetch + measure each overlay (Buffer + numbers for the gate).
  const overlayBufs: Buffer[] = [];
  const overlayStats = [];
  for (const overlay of variant.overlays) {
    const buf = await fetchLayer(overlay);
    const meta = await sharp(buf).metadata();
    const stats = await sharp(buf).stats();
    const { alphaMax, alphaMean } = alphaOf(stats as never);
    overlayBufs.push(buf);
    overlayStats.push({
      pass: overlay.pass,
      stoneGroup: overlay.stoneGroup,
      url: overlay.url,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      alphaMax,
      alphaMean,
    });
  }

  // Gate on plain numbers (PURE). missing-base/dimension-mismatch/empty-layer block.
  const warnings = validateVariant({
    base: { width: baseWidth, height: baseHeight },
    overlays: overlayStats,
    minAlphaMean: opts.minAlphaMean,
  });

  // `no-overlays` alone is advisory: with ?force=1 we still flatten base-only.
  const blocking = warnings.filter((w) =>
    opts.force ? w.code !== "no-overlays" : true,
  );
  if (blocking.length > 0) {
    return { ok: false, warnings: blocking };
  }

  // PASS — composite in z-order (array order = z-order; "over" = alpha-over).
  const buffer = await sharp(baseBuf)
    .composite(overlayBufs.map((input) => ({ input, blend: "over" as const })))
    .png()
    .toBuffer();

  return {
    ok: true,
    deliverable: { format: "png", width: baseWidth, height: baseHeight },
    buffer,
  };
}
