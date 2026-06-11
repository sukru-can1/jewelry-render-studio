"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { privateUrl } from "@/lib/blob";

// A single gallery layer card (160×160 thumbnail). PNG (stone) layers sit on the
// transparency checkerboard so the operator sees alpha at a glance; JPEG/opaque
// (metal) layers sit on the solid --card surface. Every <img src> resolves
// through the auth-gated /api/file proxy (T-05-07) — never a raw public Blob URL.

export type GalleryCardLayer = {
  id: string;
  jobId: string;
  pass: string;
  format: string;
  url: string;
  combo: Record<string, unknown> | null;
};

// Inherited group-chip colors (diamond=accent, stone2=info, stone3=warning).
// Exported so the Phase-6 LayerCompositor reuses the exact same map (no redefine).
export const GROUP_CHIP: Record<string, string> = {
  diamond: "bg-accent/15 text-accent",
  stone2: "bg-info/15 text-info",
  stone3: "bg-warning/15 text-warning",
};

export function comboLabel(combo: Record<string, unknown> | null): string {
  if (combo && typeof combo === "object") {
    const parts = [combo.angleKey, combo.metalKey, combo.stoneGroup, combo.pass]
      .filter((v) => typeof v === "string" && (v as string).length > 0)
      .map((v) => String(v));
    if (parts.length > 0) return parts.join(" · ");
  }
  return "render";
}

export function downloadName(layer: GalleryCardLayer): string {
  const c = layer.combo ?? {};
  const ext = layer.format || layer.url.split(".").pop() || "png";
  const parts = [c.angleKey, c.metalKey, c.stoneGroup, c.pass ?? layer.pass]
    .filter((v) => typeof v === "string" && (v as string).length > 0)
    .map((v) => String(v));
  const base = parts.length > 0 ? parts.join("_") : "layer";
  return `${base}.${ext}`;
}

function isTransparent(layer: GalleryCardLayer): boolean {
  return (
    layer.pass === "stone" ||
    layer.format.toLowerCase().includes("png")
  );
}

export function LayerCard({
  layer,
  onOpen,
}: {
  layer: GalleryCardLayer;
  onOpen: () => void;
}) {
  const [errored, setErrored] = React.useState(false);
  const transparent = isTransparent(layer);
  const stoneGroup =
    typeof layer.combo?.stoneGroup === "string"
      ? (layer.combo.stoneGroup as string)
      : null;
  const formatBadge = layer.format.toLowerCase().includes("png")
    ? "PNG"
    : "JPEG";
  const src = privateUrl(layer.url);
  const dl = `${src}&download=1&name=${encodeURIComponent(downloadName(layer))}`;

  return (
    <div className="group flex flex-col gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "relative size-40 overflow-hidden rounded-lg border border-border outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
          transparent ? "gallery-checkerboard" : "bg-card",
        )}
        aria-label={`Preview ${comboLabel(layer.combo)}`}
      >
        {errored ? (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Couldn&apos;t load
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={comboLabel(layer.combo)}
            className="size-full object-contain"
            onError={() => setErrored(true)}
          />
        )}
        <span className="absolute right-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold tracking-[0.04em] text-foreground">
          {formatBadge}
        </span>
        <a
          href={dl}
          onClick={(e) => e.stopPropagation()}
          download
          className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs font-medium text-foreground opacity-0 transition group-hover:opacity-100 hover:bg-background focus-visible:opacity-100"
          aria-label={`Download ${downloadName(layer)}`}
        >
          <Download className="size-3" aria-hidden />
          Download
        </a>
      </button>
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {comboLabel(layer.combo)}
        </span>
        {/* The full beauty pass IS the product render; metal/stone are
            secondary compositing layers and are labeled as such. */}
        {layer.pass !== "full" ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">
            layer pass
          </span>
        ) : null}
        {stoneGroup ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold",
              GROUP_CHIP[stoneGroup] ?? "bg-muted text-muted-foreground",
            )}
          >
            {stoneGroup}
          </span>
        ) : null}
      </div>
    </div>
  );
}
