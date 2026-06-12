"use client";

import { Button } from "@/app/components/ui/button";

// UX audit B8 — (app) error boundary. Catches unexpected render/data errors
// under the auth-gated shell and shows the calm error card instead of a blank
// crash; reset() re-renders the segment. Only the digest (when present) is
// surfaced — never the raw error message.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-foreground">Something went wrong.</p>
      {error.digest ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button variant="secondary" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
