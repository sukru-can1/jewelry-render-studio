"use client";

import * as React from "react";
import { Copy, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { ScrollArea } from "@/app/components/ui/scroll-area";

// UI-SPEC §"Error-log viewer" — bounded-height, monospace stdout/stderr tail
// (Job.error, which by repo convention holds status.error || status.output).
// A calm one-line summary sits above the raw tail; Copy ghost button copies the
// raw text with a "Log copied." toast. NEVER renders secret/env names — it only
// shows the worker-emitted Job.error string as persisted.

const SUMMARY = "This render failed on the worker. The log below has the details.";
const EMPTY = "No log was captured for this failure.";

export function ErrorLog({ error }: { error: string | null | undefined }) {
  const log = (error ?? "").trim();

  async function copy() {
    try {
      await navigator.clipboard.writeText(log);
      toast.success("Log copied.");
    } catch {
      toast.error("Couldn't copy the log.");
    }
  }

  if (!log) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">{EMPTY}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{SUMMARY}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            <Terminal className="size-3.5" strokeWidth={1.75} aria-hidden />
            Render log
          </span>
          <Button variant="ghost" size="sm" className="h-7" onClick={copy}>
            <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />
            Copy
          </Button>
        </div>
        <ScrollArea className="max-h-[280px]">
          <pre className="overflow-x-auto whitespace-pre p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {log}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}
