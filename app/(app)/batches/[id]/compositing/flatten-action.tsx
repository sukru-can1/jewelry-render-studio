"use client";

import * as React from "react";
import { Check, ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { privateUrl } from "@/lib/blob";

import type { FlattenWarning } from "@/lib/compositing/validate";

// COMP-02 → COMP-03 — the per-variant Flatten & download action. Secondary Button
// (NOT teal — the teal primary is reserved for "Download all deliverables").
//
// On click it POSTs the Plan-01 flatten route
//   POST /batches/<id>/flatten?angle=<angle>&metal=<metal>[&force=1]
// and branches on the route's own contract (never re-deriving the gate client-side):
//   • 200 {ok:true}  → kick a download of the deliverable through the /api/file
//                       attachment proxy + sonner toast + an inline "Deliverable
//                       ready" badge (so a re-flatten isn't needed).
//   • 200 {ok:false} → bubble the warnings up to the compositor's WARN banner; the
//                       button STAYS enabled (never a silent block). A `no-overlays`
//                       advisory offers a "Flatten metal only" re-POST with &force=1.
//   • non-2xx / net  → destructive error toast + the button stays a Retry affordance.

type FlattenOk = {
  ok: true;
  deliverable: { url: string; format: string; width: number; height: number };
};
type FlattenWarn = { ok: false; warnings: FlattenWarning[] };
type FlattenResponse = FlattenOk | FlattenWarn;

export function FlattenAction({
  batchId,
  angleKey,
  metalKey,
  hasBase,
  downloadName,
  warnings,
  onWarnings,
}: {
  batchId: string;
  angleKey: string;
  metalKey: string;
  hasBase: boolean;
  downloadName: string;
  /** Warnings currently surfaced for this variant (owned by the compositor). */
  warnings: FlattenWarning[];
  /** Hand validation warnings back up so the compositor renders the WARN banner. */
  onWarnings: (warnings: FlattenWarning[]) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  // empty-scope: no metal base for this variant → disabled with the SPEC reason.
  const disabled = !hasBase;

  const advisoryOnly =
    warnings.length > 0 && warnings.every((w) => w.code === "no-overlays");

  function triggerDownload(deliverableUrl: string) {
    // Reuse the /api/file attachment pattern (privateUrl + &download=1&name=…).
    const href = `${privateUrl(deliverableUrlToPathname(deliverableUrl))}&download=1&name=${encodeURIComponent(
      downloadName,
    )}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = downloadName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function run(force: boolean) {
    setPending(true);
    try {
      const params = new URLSearchParams({ angle: angleKey, metal: metalKey });
      if (force) params.set("force", "1");
      const res = await fetch(`/batches/${batchId}/flatten?${params.toString()}`, {
        method: "POST",
      });

      if (!res.ok) {
        toast.error("Couldn't flatten this variant. Try again.");
        return;
      }

      const data = (await res.json()) as FlattenResponse;

      if (data.ok) {
        onWarnings([]);
        setReady(true);
        triggerDownload(data.deliverable.url);
        toast.success(`Downloading ${downloadName}.`);
      } else {
        // Gate FAIL — surface the WARN banner, NEVER silently proceed. Button stays
        // enabled so the operator can fix upstream or force a metal-only flatten.
        onWarnings(data.warnings);
        setReady(false);
      }
    } catch {
      toast.error("Couldn't flatten this variant. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        onClick={() => run(false)}
        title={disabled ? "No metal base for this variant." : undefined}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
        ) : (
          <ImageDown className="size-4" strokeWidth={1.75} aria-hidden />
        )}
        {pending ? "Flattening…" : "Flatten & download"}
      </Button>

      {ready ? (
        <Badge variant="secondary" className="gap-1">
          <Check className="size-3" strokeWidth={2} aria-hidden />
          Deliverable ready
        </Badge>
      ) : null}

      {/* no-overlays is advisory: offer a metal-only flatten (re-POST with force). */}
      {advisoryOnly && !pending ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => run(true)}
        >
          Flatten metal only
        </Button>
      ) : null}
    </div>
  );
}

/** The route returns deliverable.url already shaped as the /api/file proxy URL
 *  (privateUrl(pathname)). Recover the underlying pathname so we can re-attach the
 *  &download=1&name=… attachment params without double-encoding the proxy URL. */
function deliverableUrlToPathname(url: string): string {
  try {
    const u = new URL(url, "http://local");
    const pathname = u.searchParams.get("pathname");
    if (pathname) return pathname;
  } catch {
    // fall through
  }
  return url;
}
