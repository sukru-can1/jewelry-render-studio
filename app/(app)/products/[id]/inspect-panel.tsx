"use client";

// UI-SPEC §3 — the inspect action surface + states. Decision #3: on-demand poll
// (interval + on focus) while the inspection is in-flight, NOT a webhook. The
// inspect/poll Server Actions are the security boundary (requireSession inside);
// this client component is presentation + polling only.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import type { ParsedInventory } from "@/lib/inventory";
import { startInspection, pollInspection } from "@/lib/products/inspection";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";

import { InventoryViewer } from "../inventory-viewer";

type InspectionView = {
  id: string;
  status: string;
  error: string | null;
  inventory: ParsedInventory | null;
} | null;

const RUNNING_BANNER =
  "Inspecting materials — this usually takes under a minute. You can leave this page; we'll keep the result.";
const EMPTY_COPY =
  "Run material inspection to detect this model's objects and materials, then assign them to groups.";
const FAILED_COPY =
  "Couldn't inspect this model. The render worker reported an error.";

function isRunning(status: string | undefined): boolean {
  return status === "in_queue" || status === "in_progress";
}

export function InspectPanel({
  productId,
  inspection,
}: {
  productId: string;
  inspection: InspectionView;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pollingRef = useRef(false);

  const running = isRunning(inspection?.status);

  const runStart = useCallback(async () => {
    setBusy(true);
    try {
      await startInspection(productId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [productId, router]);

  const runPoll = useCallback(async () => {
    if (!inspection || pollingRef.current) return;
    pollingRef.current = true;
    try {
      await pollInspection(inspection.id);
      router.refresh();
    } finally {
      pollingRef.current = false;
    }
  }, [inspection, router]);

  // On-demand poll: interval while running + on window focus (decision #3).
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(runPoll, 5000);
    const onFocus = () => runPoll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [running, runPoll]);

  // Not yet inspected (no inspection or product needs_inspection).
  if (!inspection || inspection.status === "needs_inspection") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-12 text-center">
        <p className="max-w-md text-sm text-muted-foreground">{EMPTY_COPY}</p>
        <Button onClick={runStart} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Inspect materials
        </Button>
      </div>
    );
  }

  if (running) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            {inspection.status === "in_progress" ? "running" : "queued"}
          </Badge>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">{RUNNING_BANNER}</p>
        </div>
        <InventoryViewer inventory={null} loading />
      </div>
    );
  }

  if (inspection.status === "failed") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{FAILED_COPY}</p>
          {inspection.error ? (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-destructive/80">
              {inspection.error.slice(0, 1000)}
            </pre>
          ) : null}
        </div>
        <Button variant="secondary" onClick={runStart} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Retry inspection
        </Button>
      </div>
    );
  }

  // completed
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">done</Badge>
        <Button variant="ghost" size="sm" onClick={runStart} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Re-inspect
        </Button>
      </div>
      <InventoryViewer inventory={inspection.inventory} />
    </div>
  );
}
