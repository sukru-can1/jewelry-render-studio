import Link from "next/link";
import { Box } from "lucide-react";

import { relativeTime } from "@/lib/format";
import { Badge } from "@/app/components/ui/badge";
import { Card } from "@/app/components/ui/card";

// UI-SPEC §1 — Product card. Built on the Phase 1 interactive Card: a 160×160
// thumbnail (placeholder glyph when no model preview — the worker produces none;
// any real thumbnail would be delivered via /api/file, never a public url),
// product name, mono model filename, status pill, relative created-at (mono).
// The WHOLE card is a link to /products/[id] (reopen). Hover lift + focus-within.

// Status-pill mapping covers the schema default ('draft') so no value renders
// unmapped. Unknown values fall back to a neutral pill (never blank).
const STATUS_PILL: Record<
  string,
  { label: string; variant: "secondary" | "outline" | "destructive" | "default" }
> = {
  draft: { label: "needs inspection", variant: "outline" },
  needs_inspection: { label: "needs inspection", variant: "outline" },
  inspecting: { label: "inspecting", variant: "secondary" },
  needs_groups: { label: "needs groups", variant: "secondary" },
  ready: { label: "ready", variant: "default" },
  inspection_failed: { label: "inspection failed", variant: "destructive" },
};

export type ProductCardData = {
  id: string;
  name: string;
  modelUrl: string | null;
  status: string;
  createdAt: string | Date;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const pill = STATUS_PILL[product.status] ?? {
    label: product.status || "unknown",
    variant: "outline" as const,
  };
  const filename = product.modelUrl ? product.modelUrl.split("/").pop() : null;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group/link rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="gap-0 transition-transform group-hover/link:-translate-y-0.5 group-focus-within/link:ring-2 group-focus-within/link:ring-ring">
        <div className="flex size-40 w-full items-center justify-center bg-muted/40 text-muted-foreground">
          <Box className="size-10" strokeWidth={1.25} aria-hidden />
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold leading-tight text-foreground">
              {product.name}
            </span>
            <Badge variant={pill.variant} className="shrink-0">
              {pill.label}
            </Badge>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {filename ?? "no model"}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {relativeTime(product.createdAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
