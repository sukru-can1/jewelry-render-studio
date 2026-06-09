"use client";

import * as React from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { cancelBatch, cancelJob } from "@/lib/orchestration/cancel";

// UI-SPEC §"Cancel control + confirm" — batch-level + per-job destructive confirm.
// Immediate-cancel model A (04-04): the Server Action already writes 'cancelled';
// the optimistic 'cancelling' label is a brief client concern that resolves to the
// persisted 'cancelled' on the next freshness read — NO reconcile two-step here.

// Cancel batch (header). Enabled only while cancelable jobs remain.
export function CancelBatchControl({
  batchId,
  cancelableCount,
  onCancelled,
}: {
  batchId: string;
  cancelableCount: number;
  onCancelled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const disabled = cancelableCount === 0;

  function confirm() {
    startTransition(async () => {
      const res = await cancelBatch(batchId);
      if (res.ok) {
        toast.success(
          `Batch cancelled — ${res.cancelled ?? cancelableCount} jobs stopped, completed kept.`,
        );
        onCancelled?.();
      } else {
        toast.error(res.error ?? "Couldn't cancel this batch.");
      }
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled || pending}>
          <Ban className="size-4" strokeWidth={1.75} aria-hidden />
          Cancel batch
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this batch?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops the {cancelableCount} jobs still queued or running. Renders
            already completed are kept. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep rendering</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending}
            className={cn(
              "bg-destructive/10 text-destructive hover:bg-destructive/20",
            )}
          >
            {pending ? "Cancelling…" : "Cancel batch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Cancel job (row action). Rendered only for queued/running jobs.
export function CancelJobControl({
  jobId,
  combo,
  onCancelled,
}: {
  jobId: string;
  combo: string;
  onCancelled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await cancelJob(jobId);
      if (res.ok) {
        toast.success("Job cancelled.");
        onCancelled?.();
      } else {
        toast.error(res.error ?? "Couldn't cancel this job.");
      }
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={pending}
        >
          <Ban className="size-3.5" strokeWidth={1.75} aria-hidden />
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops the{" "}
            <span className="font-mono text-foreground">{combo}</span> render. It
            can&apos;t be undone — you can rebuild the batch later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep rendering</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending}
            className={cn(
              "bg-destructive/10 text-destructive hover:bg-destructive/20",
            )}
          >
            {pending ? "Cancelling…" : "Cancel job"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
