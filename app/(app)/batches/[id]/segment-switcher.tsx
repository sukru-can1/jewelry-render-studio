"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Images, Layers } from "lucide-react";

import { cn } from "@/lib/utils";

// UI-SPEC §Layout — the lightweight batch-detail segment switcher. Lets an
// operator move between the Phase 4 monitor, the Phase 5 gallery, and this Phase 6
// compositing surface. Plain links (each segment is its own DB-only Server
// Component route) styled like the inherited toggle-group; the `active` segment is
// the neutral-filled "on" state. 44px hit-area on every segment (inherited rule).
//
// The switcher renders on all three batch surfaces (monitor, gallery, compositing),
// including their error branches, so an operator can always move between segments.

type Segment = "monitor" | "gallery" | "compositing";

const SEGMENTS: {
  key: Segment;
  label: string;
  href: (id: string) => string;
  Icon: typeof Activity;
}[] = [
  { key: "monitor", label: "Monitor", href: (id) => `/batches/${id}`, Icon: Activity },
  { key: "gallery", label: "Gallery", href: (id) => `/batches/${id}/gallery`, Icon: Images },
  {
    key: "compositing",
    label: "Compositing",
    href: (id) => `/batches/${id}/compositing`,
    Icon: Layers,
  },
];

export function SegmentSwitcher({
  batchId,
  active,
}: {
  batchId: string;
  active: Segment;
}) {
  return (
    <nav
      aria-label="Batch sections"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
    >
      {SEGMENTS.map(({ key, label, href, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href(batchId)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
