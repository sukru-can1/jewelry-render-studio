import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { JobStatus } from "@prisma/client";

import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/lib/utils";

import type { BatchStatus } from "@/lib/orchestration/batch-status";

// UI-SPEC §"Job-status → status-pill mapping" + "Derived batch status".
// Pure presentational: map each DB JobStatus / derived batch status to an
// inherited Phase-1 semantic token (success/warning/info/destructive/neutral)
// rendered on the inherited Badge `outline` variant with explicit token color
// classes — NO new Badge variant, NO new hue, NO teal for status (accent stays
// scarce). Labels uppercase per the Label typographic role.

type Token = "success" | "warning" | "info" | "destructive" | "neutral";

const TOKEN_CLASS: Record<Token, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
};

function Pill({
  token,
  label,
  Icon,
  pulse = false,
}: {
  token: Token;
  label: string;
  Icon: LucideIcon;
  pulse?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[0.625rem] font-semibold uppercase tracking-[0.04em]",
        TOKEN_CLASS[token],
      )}
    >
      <Icon
        className={cn("size-3", pulse && "motion-safe:animate-pulse")}
        strokeWidth={2}
        aria-hidden
      />
      {label}
    </Badge>
  );
}

// DB JobStatus → operator-facing 5-state pill (UI-SPEC table).
const JOB_PILL: Record<JobStatus, { token: Token; label: string; Icon: LucideIcon; pulse?: boolean }> = {
  queued: { token: "warning", label: "queued", Icon: Clock },
  submitted: { token: "warning", label: "queued", Icon: Clock },
  in_queue: { token: "warning", label: "queued", Icon: Clock },
  in_progress: { token: "info", label: "running", Icon: Loader2, pulse: true },
  completed: { token: "success", label: "completed", Icon: CheckCircle2 },
  failed: { token: "destructive", label: "failed", Icon: XCircle },
  cancelled: { token: "neutral", label: "cancelled", Icon: Ban },
};

export function JobStatusPill({ status }: { status: JobStatus }) {
  const cfg = JOB_PILL[status] ?? {
    token: "neutral" as Token,
    label: String(status),
    Icon: Clock,
  };
  return <Pill token={cfg.token} label={cfg.label} Icon={cfg.Icon} pulse={cfg.pulse} />;
}

// Derived batch status → pill (UI-SPEC "Derived batch status"). "partly failed"
// → warning (never a new hue). Both cancelling + cancelled use the neutral token.
const BATCH_PILL: Record<BatchStatus, { token: Token; label: string; Icon: LucideIcon; pulse?: boolean }> = {
  queued: { token: "warning", label: "queued", Icon: Clock },
  running: { token: "info", label: "running", Icon: Loader2, pulse: true },
  completed: { token: "success", label: "completed", Icon: CheckCircle2 },
  "partly failed": { token: "warning", label: "partly failed", Icon: XCircle },
  failed: { token: "destructive", label: "failed", Icon: XCircle },
  cancelling: { token: "neutral", label: "cancelling", Icon: Ban, pulse: true },
  cancelled: { token: "neutral", label: "cancelled", Icon: Ban },
};

export function BatchStatusPill({ status }: { status: BatchStatus }) {
  const cfg = BATCH_PILL[status] ?? {
    token: "neutral" as Token,
    label: String(status),
    Icon: Clock,
  };
  return <Pill token={cfg.token} label={cfg.label} Icon={cfg.Icon} pulse={cfg.pulse} />;
}
