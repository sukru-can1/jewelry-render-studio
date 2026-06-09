"use client";

import * as React from "react";
import { DownloadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";

// COMP-03 — the batch-level "Download all deliverables" action (UI-SPEC New
// Component Inventory §4). This is the SINGLE primary action per view (teal default
// Button), distinct from the per-variant secondary "Flatten & download".
//
// On click it streams the COMP-03 zip from the existing auth-gated route:
//   GET /batches/<id>/download?deliverables=1
// which zips the batch's flattened deliverables (lazily flattening any missing
// ones, capped). We trigger the browser download via a programmatic <a> (a GET the
// browser saves as a file) rather than fetch+blob, so a large zip streams straight
// to disk without buffering in JS.
//
// States (UI-SPEC §4 + Copywriting Contract):
//   • idle        → "Download all deliverables"
//   • preparing   → loader-2 + "Preparing download…" (brief; the route streams)
//   • started     → browser download begins + sonner "Preparing {n} deliverables for download."
//   • error       → "Couldn't prepare that download. Try again." (toast) → Retry affordance
//   • empty-scope → disabled with tooltip "Flatten some variants first." when
//                   nothing has been flattened yet (flattenedCount === 0)
//
// `flattenedCount` is BLOB-DERIVED by the server page (list({prefix:deliverables/}))
// — NOT a DB Layer.isFlattened row (which stays all-false under blob-only, 06-01).
export function DownloadAllDeliverables({
  batchId,
  flattenedCount,
}: {
  batchId: string;
  /** Blob-derived count of already-flattened deliverables; 0 ⇒ empty-scope. */
  flattenedCount: number;
}) {
  const [preparing, setPreparing] = React.useState(false);

  // empty-scope: nothing flattened yet → disabled with the SPEC reason.
  const emptyScope = flattenedCount === 0;
  const disabled = emptyScope || preparing;

  function run() {
    setPreparing(true);
    try {
      // Programmatic GET → the browser saves the streamed zip as a file. The route
      // sets Content-Disposition: attachment so this never navigates the page away.
      const a = document.createElement("a");
      a.href = `/batches/${batchId}/download?deliverables=1`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(
        `Preparing ${flattenedCount} deliverables for download.`,
      );
    } catch {
      toast.error("Couldn't prepare that download. Try again.");
    } finally {
      // The download is handed to the browser synchronously; clear the brief
      // preparing state on the next tick so the spinner doesn't stick.
      setTimeout(() => setPreparing(false), 600);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="default"
        size="default"
        disabled={disabled}
        onClick={run}
        title={emptyScope ? "Flatten some variants first." : undefined}
      >
        {preparing ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
        ) : (
          <DownloadCloud className="size-4" strokeWidth={1.75} aria-hidden />
        )}
        {preparing ? "Preparing download…" : "Download all deliverables"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Large batches may take a moment to zip.
      </span>
    </div>
  );
}
