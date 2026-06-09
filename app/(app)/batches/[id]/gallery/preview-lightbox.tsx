"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { privateUrl } from "@/lib/blob";

import { comboLabel, downloadName, type GalleryCardLayer } from "./layer-card";

// OUT-03 — full-quality preview lightbox built on the inherited shadcn dialog
// (NO third-party lightbox). Shows the layer through the auth-gated /api/file
// proxy, checkerboard/solid per pass, combo title + format/pass/group chips, a
// mono metadata panel, Download layer + quiet Download full set, and ←/→ prev/
// next within the supplied order. ESC + focus-trap come from Radix Dialog.

function isTransparent(layer: GalleryCardLayer): boolean {
  return layer.pass === "stone" || layer.format.toLowerCase().includes("png");
}

export function PreviewLightbox({
  layers,
  index,
  onIndexChange,
  onClose,
  downloadSetHref,
}: {
  layers: GalleryCardLayer[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  downloadSetHref: string;
}) {
  const open = index !== null;
  const layer = index !== null ? layers[index] : null;

  const go = React.useCallback(
    (delta: number) => {
      if (index === null || layers.length === 0) return;
      const next = (index + delta + layers.length) % layers.length;
      onIndexChange(next);
    },
    [index, layers.length, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  if (!layer) {
    return (
      <Dialog open={false} onOpenChange={(v) => !v && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const transparent = isTransparent(layer);
  const src = privateUrl(layer.url);
  const dl = `${src}&download=1&name=${encodeURIComponent(downloadName(layer))}`;
  const formatBadge = layer.format.toLowerCase().includes("png") ? "PNG" : "JPEG";
  const stoneGroup =
    typeof layer.combo?.stoneGroup === "string"
      ? (layer.combo.stoneGroup as string)
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl gap-4">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {comboLabel(layer.combo)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold">
            {formatBadge}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">
            {layer.pass}
          </span>
          {stoneGroup ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">
              {stoneGroup}
            </span>
          ) : null}
        </div>

        <div className="relative">
          <div
            className={cn(
              "flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-border",
              transparent ? "gallery-checkerboard" : "bg-card",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={comboLabel(layer.combo)}
              className="max-h-[60vh] w-auto object-contain"
            />
          </div>
          {layers.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Previous layer"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Next layer"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-3 font-mono text-xs">
          <dt className="text-muted-foreground">layer</dt>
          <dd className="truncate">{layer.id}</dd>
          <dt className="text-muted-foreground">job</dt>
          <dd className="truncate">{layer.jobId}</dd>
          <dt className="text-muted-foreground">format</dt>
          <dd>{layer.format}</dd>
          <dt className="text-muted-foreground">pass</dt>
          <dd>{layer.pass}</dd>
        </dl>

        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="secondary" size="sm">
            <a href={dl} download>
              <Download className="size-4" aria-hidden />
              Download layer
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={downloadSetHref}>Download full set</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
