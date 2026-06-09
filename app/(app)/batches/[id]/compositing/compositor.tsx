"use client";

import * as React from "react";
import { Eye, EyeOff, RotateCcw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { privateUrl } from "@/lib/blob";
import { Button } from "@/app/components/ui/button";
import { Toggle } from "@/app/components/ui/toggle";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/app/components/ui/alert";
import { GROUP_CHIP } from "../gallery/layer-card";
import type { Variant, CompositingLayer } from "@/lib/compositing/variants";
import type { FlattenWarning } from "@/lib/compositing/validate";

import { FlattenAction } from "./flatten-action";

// COMP-01 — the in-browser LayerCompositor for ONE compositing variant (angle ×
// metal). A square preview frame on the inherited `gallery-checkerboard` backing
// holds absolutely-positioned <img> layers: the metal base at z=0 (the floor,
// default-on) under each stone PNG stacked by ascending z (default-on). Every
// `src = privateUrl(layer.url)` → the auth-gated /api/file proxy (T-06-08) — never
// a raw public Blob URL. Per-layer eye/eye-off toggles flip each layer's opacity
// 1↔0. This is client-only PREVIEW composition; the catalog-ready flatten is the
// server route the FlattenAction calls.

// Each renderable layer carries a stable id for the toggle/visibility map.
type StackLayer = CompositingLayer & { id: string; isBase: boolean };

function layerLabel(layer: StackLayer): string {
  if (layer.isBase) return "metal · alloycolour";
  return `stone · ${layer.stoneGroup ?? "stone"}`;
}

function dimsLabel(layer: StackLayer): string | null {
  // Dimensions are not carried in the DB row; left null unless a future combo adds
  // them. Kept as an explicit hook so the mono dimension chip can light up later.
  void layer;
  return null;
}

/** WARN banner copy (NET-NEW Phase-6 strings, UI-SPEC §Copywriting Contract). */
function warningCopy(w: FlattenWarning): { title: string; detail: string | null } {
  switch (w.code) {
    case "dimension-mismatch": {
      const d = w.detail;
      const detail =
        d && d.expectedWidth != null
          ? `metal ${d.expectedWidth}×${d.expectedHeight} ≠ ${
              w.layer?.stoneGroup ?? "stone"
            } ${d.actualWidth}×${d.actualHeight}`
          : w.message;
      return { title: "These layers don't line up.", detail };
    }
    case "missing-base":
      return { title: "No metal base for this variant.", detail: null };
    case "empty-layer":
      return {
        title: "A stone layer looks empty.",
        detail: `${w.layer?.stoneGroup ?? "stone"} has almost no visible area — double-check it before flattening.`,
      };
    case "no-overlays":
      return {
        title: "No stone overlays for this variant.",
        detail: "You can flatten the metal base only.",
      };
    default:
      return { title: w.message, detail: null };
  }
}

export function LayerCompositor({
  batchId,
  variant,
}: {
  batchId: string;
  variant: Variant;
}) {
  // Build the ordered render stack: base (z=0, floor) then overlays in z-order.
  const stack = React.useMemo<StackLayer[]>(() => {
    const layers: StackLayer[] = [];
    if (variant.base) {
      layers.push({ ...variant.base, id: "base", isBase: true });
    }
    variant.overlays.forEach((o, i) => {
      layers.push({ ...o, id: `overlay-${i}-${o.stoneGroup ?? "stone"}`, isBase: false });
    });
    return layers;
  }, [variant]);

  // Per-layer visibility — every layer defaults ON.
  const [visible, setVisible] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(stack.map((l) => [l.id, true])),
  );
  // Per-layer image load error (the rest of the stack still composes).
  const [errored, setErrored] = React.useState<Record<string, boolean>>({});
  // WARN banner state — owned here, set by the FlattenAction's onWarnings.
  const [warnings, setWarnings] = React.useState<FlattenWarning[]>([]);

  const toggle = (id: string) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  const retry = (id: string) =>
    setErrored((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const title = `${variant.angleKey ?? "—"} · ${variant.metalKey ?? "—"}`;
  const downloadName = `${variant.angleKey ?? "variant"}_${variant.metalKey ?? "metal"}_flattened.png`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-base font-semibold text-foreground">
          {title}
        </h3>
      </div>

      {/* WARN banner above the frame — best-effort stack still shown below. */}
      {warnings.length > 0 ? (
        <Alert className="border-warning/40 bg-warning/10 text-warning-foreground [&>svg]:text-warning">
          <TriangleAlert className="size-4" strokeWidth={1.75} aria-hidden />
          <AlertTitle className="text-foreground">
            {warningCopy(warnings[0]).title}
          </AlertTitle>
          {warnings.map((w, i) => {
            const { detail } = warningCopy(w);
            return detail ? (
              <AlertDescription key={i} className="font-mono text-xs text-foreground/80">
                {detail}
              </AlertDescription>
            ) : null;
          })}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Composite preview frame: stacked absolutely-positioned <img> on the
            inherited checkerboard. object-contain so every layer aligns. */}
        <div className="relative aspect-square w-full max-w-[24rem] shrink-0 overflow-hidden rounded-lg border border-border gallery-checkerboard">
          {stack.length === 0 ? (
            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No layers
            </span>
          ) : (
            stack.map((layer, z) =>
              errored[layer.id] ? (
                <div
                  key={layer.id}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-center"
                  style={{ zIndex: z }}
                >
                  <span className="text-xs text-muted-foreground">
                    Couldn&apos;t load this layer.
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retry(layer.id)}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
                    Retry
                  </Button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={layer.id}
                  src={privateUrl(layer.url)}
                  alt={layerLabel(layer)}
                  className="absolute inset-0 size-full object-contain transition-opacity"
                  style={{
                    zIndex: z,
                    opacity: visible[layer.id] ? 1 : 0,
                    visibility: visible[layer.id] ? "visible" : "hidden",
                  }}
                  onError={() =>
                    setErrored((prev) => ({ ...prev, [layer.id]: true }))
                  }
                />
              ),
            )
          )}
        </div>

        {/* Toggle column — one row per layer. 44px hit-area (inherited rule). */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {stack.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No metal base for this variant.
            </p>
          ) : (
            stack.map((layer) => {
              const on = visible[layer.id];
              const dims = dimsLabel(layer);
              return (
                <div key={layer.id} className="flex items-center gap-2">
                  <Toggle
                    pressed={on}
                    onPressedChange={() => toggle(layer.id)}
                    aria-label={`${on ? "Hide" : "Show"} ${layerLabel(layer)}`}
                    className="size-11 shrink-0"
                  >
                    {on ? (
                      <Eye className="size-4" strokeWidth={1.75} aria-hidden />
                    ) : (
                      <EyeOff className="size-4" strokeWidth={1.75} aria-hidden />
                    )}
                  </Toggle>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-xs",
                      on ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    {layerLabel(layer)}
                    {layer.isBase ? (
                      <span className="ml-2 text-[0.625rem] uppercase tracking-[0.04em] text-muted-foreground">
                        base
                      </span>
                    ) : null}
                  </span>
                  {!layer.isBase && layer.stoneGroup ? (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[0.625rem] font-semibold",
                        GROUP_CHIP[layer.stoneGroup] ??
                          "bg-muted text-muted-foreground",
                        !on && "opacity-50",
                      )}
                    >
                      {layer.stoneGroup}
                    </span>
                  ) : null}
                  {dims ? (
                    <span className="font-mono text-[0.625rem] text-muted-foreground">
                      {dims}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}

          <div className="mt-2">
            <FlattenAction
              batchId={batchId}
              angleKey={variant.angleKey}
              metalKey={variant.metalKey}
              hasBase={Boolean(variant.base)}
              downloadName={downloadName}
              warnings={warnings}
              onWarnings={setWarnings}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
