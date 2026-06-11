"use client";

import * as React from "react";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/app/components/ui/toggle-group";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { groupLayers, sortPrimaryFirst, type GroupBy } from "@/lib/gallery/group";

import { LayerCard, type GalleryCardLayer } from "./layer-card";
import { PreviewLightbox } from "./preview-lightbox";

// OUT-02/03 — the interactive gallery body: group-by toggle (Metal default),
// filter chips read from the PRESENT layer rows (never hardcoded), the grouped
// sections of layer cards, and the preview lightbox. All client-side over data
// the DB-only Server Component already loaded — no fetching here.

const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "metal", label: "Metal" },
  { key: "angle", label: "Angle" },
  { key: "pass", label: "Pass" },
  { key: "variant", label: "Variant" },
];

type FilterKey = "all" | "jpeg" | "png";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "jpeg", label: "JPEG" },
  { key: "png", label: "PNG" },
];

function sectionTitle(g: {
  groupBy: GroupBy;
  metalKey?: string;
  angleKey?: string;
  pass?: string;
  stoneGroup?: string;
}): string {
  switch (g.groupBy) {
    case "angle":
      return g.angleKey ?? "Other";
    case "pass":
      return [g.pass, g.stoneGroup].filter(Boolean).join(" · ") || "Other";
    case "variant":
      return [g.metalKey, g.stoneGroup ?? g.pass].filter(Boolean).join(" · ") || "Other";
    case "metal":
    default:
      return [g.metalKey, g.angleKey].filter(Boolean).join(" · ") || "Other";
  }
}

function matchesFilter(layer: GalleryCardLayer, filter: FilterKey): boolean {
  if (filter === "all") return true;
  const isPng = layer.format.toLowerCase().includes("png");
  return filter === "png" ? isPng : !isPng;
}

export function GalleryBody({
  layers,
  downloadSetHref,
}: {
  layers: GalleryCardLayer[];
  downloadSetHref: string;
}) {
  const [groupBy, setGroupBy] = React.useState<GroupBy>("metal");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const filtered = React.useMemo(
    () => layers.filter((l) => matchesFilter(l, filter)),
    [layers, filter],
  );

  // Full-pass-first: the full beauty render is the PRIMARY output, so it leads
  // inside every group section (and, under the "pass" grouping, the full
  // sections come first). Metal/stone rows keep their relative order behind it.
  const groups = React.useMemo(
    () => groupLayers(sortPrimaryFirst(filtered), groupBy),
    [filtered, groupBy],
  );

  // Flat order matching the rendered sections, so the lightbox prev/next walks
  // the same visual sequence.
  const flatOrder = React.useMemo(
    () => groups.flatMap((g) => g.layers),
    [groups],
  );

  const openAt = (layer: GalleryCardLayer) => {
    const i = flatOrder.findIndex((l) => l.id === layer.id);
    if (i >= 0) setLightboxIndex(i);
  };

  const hasFormatVariety = layers.some((l) =>
    l.format.toLowerCase().includes("png"),
  ) && layers.some((l) => !l.format.toLowerCase().includes("png"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ToggleGroup
          type="single"
          value={groupBy}
          onValueChange={(v) => v && setGroupBy(v as GroupBy)}
          variant="outline"
          className="flex-wrap justify-start"
        >
          {GROUP_BY_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.key} value={o.key}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex items-center gap-2">
          {hasFormatVariety ? (
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(v) => setFilter((v as FilterKey) || "all")}
              variant="outline"
              className="flex-wrap justify-start"
            >
              {FILTERS.map((f) => (
                <ToggleGroupItem key={f.key} value={f.key}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {filter !== "all" ? (
            <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <p className="font-mono text-xs text-muted-foreground">
        Showing {filtered.length} of {layers.length} layers
      </p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No layers match this filter.
        </div>
      ) : (
        groups.map((g, gi) => (
          <section key={g.key} className={cn("flex flex-col gap-3", gi > 0 && "mt-2")}>
            <h2 className="text-base font-semibold text-foreground">
              {sectionTitle(g)}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {g.layers.length}
              </span>
            </h2>
            <div className="flex flex-wrap gap-4">
              {g.layers.map((layer) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  onOpen={() => openAt(layer)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <PreviewLightbox
        layers={flatOrder}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        downloadSetHref={downloadSetHref}
      />
    </div>
  );
}
