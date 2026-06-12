import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

// UX audit C12 — breadcrumb trail rendered above detail-page headers. Server
// Component (plain links, no state): items with an href render as muted links;
// the current (href-less) item renders as plain foreground text. text-xs keeps
// it reading as chrome above the h1, never competing with content.
export function PageBreadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
    >
      {items.map((item, i) => (
        <React.Fragment key={`${i}-${item.label}`}>
          {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
