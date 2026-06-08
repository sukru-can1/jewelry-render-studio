"use client";

// UI-SPEC §3 — Material-inventory viewer. A dense table over parseInventory
// output (ParsedInventory). Parent row per MESH object: object name (mono) ·
// #material slots · max-dimension (mono mm) · current group chip (unassigned
// dashed for now). Expandable child reveals the per-material Principled BSDF
// table (Base Color swatch + RGBA mono, Metallic, Roughness, Transmission, IOR);
// absent values render "—" (the parser already returns null defensively).
//
// Names (object + material) are rendered as plain text only — React escapes
// them; no dangerouslySetInnerHTML (T-02-14, opaque untrusted worker output).

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import type {
  InventoryMaterial,
  InventoryObject,
  ParsedInventory,
} from "@/lib/inventory";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/app/components/ui/collapsible";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/lib/utils";

function num(value: number | null, digits = 3): string {
  return value === null || Number.isNaN(value) ? "—" : value.toFixed(digits);
}

function rgbaText(color: number[] | null): string {
  if (!color || color.length === 0) return "—";
  return color.map((c) => (typeof c === "number" ? c.toFixed(2) : "—")).join(" ");
}

function swatchStyle(color: number[] | null): React.CSSProperties | undefined {
  if (!color || color.length < 3) return undefined;
  const [r, g, b, a = 1] = color;
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return { backgroundColor: `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${a})` };
}

function MaterialRow({ material }: { material: InventoryMaterial }) {
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-1.5 font-mono text-xs text-foreground">{material.name || "—"}</td>
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-3 shrink-0 rounded-sm border border-border"
            style={swatchStyle(material.baseColor)}
            aria-hidden
          />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {rgbaText(material.baseColor)}
          </span>
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">{num(material.metallic, 2)}</td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">{num(material.roughness, 2)}</td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">{num(material.transmission, 2)}</td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">{num(material.ior, 3)}</td>
    </tr>
  );
}

function ObjectRow({
  object,
  materialsByName,
}: {
  object: InventoryObject;
  materialsByName: Map<string, InventoryMaterial>;
}) {
  const [open, setOpen] = useState(false);
  const slotMaterials = object.materialSlots
    .filter((s): s is string => typeof s === "string")
    .map((s) => materialsByName.get(s) ?? { name: s, baseColor: null, metallic: null, roughness: null, transmission: null, ior: null });

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <tbody className="border-t border-border">
        <tr className="hover:bg-muted/40">
          <td className="px-3 py-2">
            <CollapsibleTrigger className="flex items-center gap-2 text-left">
              <ChevronRight
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                strokeWidth={1.75}
              />
              <span className="font-mono text-sm text-foreground">{object.name || "—"}</span>
            </CollapsibleTrigger>
          </td>
          <td className="px-3 py-2 font-mono text-sm tabular-nums text-muted-foreground">{object.materialSlots.length}</td>
          <td className="px-3 py-2 font-mono text-sm tabular-nums text-muted-foreground">
            {object.maxDimension === null ? "—" : `${object.maxDimension.toFixed(2)} mm`}
          </td>
          <td className="px-3 py-2">
            <Badge variant="outline" className="border-dashed text-muted-foreground">
              unassigned
            </Badge>
          </td>
        </tr>
        <CollapsibleContent asChild>
          <tr>
            <td colSpan={4} className="bg-muted/20 px-3 pb-3 pt-1">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material</th>
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base Color</th>
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metallic</th>
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roughness</th>
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transmission</th>
                    <th className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">IOR</th>
                  </tr>
                </thead>
                <tbody>
                  {slotMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-sm text-muted-foreground">No material slots.</td>
                    </tr>
                  ) : (
                    slotMaterials.map((m, i) => <MaterialRow key={`${m.name}-${i}`} material={m} />)
                  )}
                </tbody>
              </table>
            </td>
          </tr>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  );
}

export function InventoryViewer({
  inventory,
  loading = false,
}: {
  inventory: ParsedInventory | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!inventory || inventory.objects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">No objects detected.</p>
      </div>
    );
  }

  const materialsByName = new Map(inventory.materials.map((m) => [m.name, m]));

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Object</th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slots</th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max dimension</th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group</th>
          </tr>
        </thead>
        {inventory.objects.map((object) => (
          <ObjectRow key={object.name} object={object} materialsByName={materialsByName} />
        ))}
      </table>
    </div>
  );
}
