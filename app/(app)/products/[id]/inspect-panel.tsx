"use client";

// UI-SPEC §3 — the inspect action surface + states. Decision #3: on-demand poll
// (interval + on focus) while the inspection is in-flight, NOT a webhook. The
// inspect/poll Server Actions are the security boundary (requireSession inside);
// this client component is presentation + polling only.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";

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
  createdAt: string;
} | null;

const RUNNING_BANNER =
  "Inspecting materials — this usually takes under a minute. You can leave this page; we'll keep the result.";
const EMPTY_COPY =
  "Run material inspection to detect this model's objects and materials, then assign them to groups.";
const FAILED_COPY =
  "Couldn't inspect this model. The render worker reported an error.";

// How long the job may sit before we escalate the messaging from "be patient"
// to "something's wrong" — so a job that's silently stuck is visible, not hidden
// behind a perpetual "under a minute" banner.
const SLOW_AFTER_S = 60; // queued longer than a typical cold start
const STUCK_AFTER_S = 180; // almost certainly no worker is going to pick it up

function isRunning(status: string | undefined): boolean {
  return status === "in_queue" || status === "in_progress";
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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
  const [actionError, setActionError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const running = isRunning(inspection?.status);

  const runStart = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      await startInspection(productId);
      router.refresh();
    } catch (err) {
      // Surface dispatch failures (e.g. RunPod auth/config errors) instead of
      // silently stopping the spinner with no explanation.
      setActionError(
        err instanceof Error ? err.message : "Couldn't start inspection. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [productId, router]);

  const runPoll = useCallback(async () => {
    if (!inspection || pollingRef.current) return;
    pollingRef.current = true;
    try {
      await pollInspection(inspection.id);
      setActionError(null);
      router.refresh();
    } catch (err) {
      // A failed status poll (worker unreachable, etc.) is shown rather than
      // swallowed; it clears on the next successful poll.
      setActionError(
        err instanceof Error ? err.message : "Couldn't read the inspection status.",
      );
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

  // Live elapsed clock while running. `nowTs` is null until mount so server and
  // client first-render agree (no hydration mismatch); it then ticks every 1s.
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    if (!running) {
      setNowTs(null);
      return;
    }
    setNowTs(Date.now());
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  const elapsedS =
    nowTs && inspection?.createdAt
      ? Math.max(0, Math.floor((nowTs - new Date(inspection.createdAt).getTime()) / 1000))
      : 0;

  const errorBanner = actionError ? (
    <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="break-words text-sm text-destructive">{actionError}</p>
    </div>
  ) : null;

  // Not yet inspected (no inspection or product needs_inspection).
  if (!inspection || inspection.status === "needs_inspection") {
    return (
      <div className="flex flex-col gap-4">
        {errorBanner}
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-12 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{EMPTY_COPY}</p>
          <Button onClick={runStart} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Inspect materials
          </Button>
        </div>
      </div>
    );
  }

  if (running) {
    const queued = inspection.status !== "in_progress";
    const slow = queued && elapsedS >= SLOW_AFTER_S && elapsedS < STUCK_AFTER_S;
    const stuck = queued && elapsedS >= STUCK_AFTER_S;
    const elapsedLabel = nowTs ? formatElapsed(elapsedS) : null;

    return (
      <div className="flex flex-col gap-4">
        {errorBanner}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            {inspection.status === "in_progress" ? "running" : "queued"}
          </Badge>
          {elapsedLabel ? (
            <span className="font-mono text-xs text-muted-foreground">{elapsedLabel}</span>
          ) : null}
        </div>

        {stuck ? (
          <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex flex-col gap-1">
              <p className="text-sm text-warning">
                Still queued after {elapsedLabel} — no GPU worker has picked this up.
              </p>
              <p className="text-xs text-muted-foreground">
                The render endpoint has no worker available (scaled to zero or at its worker
                quota), so the job can&apos;t start. Bring a worker online on the RunPod
                endpoint, then re-run.
              </p>
            </div>
          </div>
        ) : slow ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">
              Still queued ({elapsedLabel}). Waiting for a GPU worker — a cold start can take a
              moment; we&apos;ll keep polling.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {inspection.status === "in_progress"
                ? "Rendering the material inventory on the GPU…"
                : RUNNING_BANNER}
              {elapsedLabel ? ` · ${elapsedLabel}` : ""}
            </p>
          </div>
        )}

        {stuck ? (
          <Button variant="secondary" onClick={runStart} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Re-run inspection
          </Button>
        ) : null}

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
