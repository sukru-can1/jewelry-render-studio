"use client";

// INTEL-05 (Phase 9, 09-03) — the per-job AI intel panel on the batch monitor
// (09-AI-SPEC §7.2: human-in-the-loop, ALWAYS on, NEVER silent). Per
// intelligence job it renders: the preview thumbnail (auth-gated file proxy),
// the D1–D8 score bars (colored by floor — semantic success/warning/destructive
// tokens only), the raised flags, the proposed vs applied knob deltas (signed,
// mono), the model's rationale, the loop's reached decision, and the operator
// Accept / Reject / Override controls wired to the auth-first Server Action.
// An ESCALATED job is a distinct "Needs human" state showing WHY it escalated.
// The panel holds NO authority — applyIntelDecision re-checks auth + scope.
// Semantic tokens only, teal accent on primary actions, NO purple; numerics in
// mono; 44px (h-11) hit areas on the decision buttons.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { cn } from "@/lib/utils";
import { applyIntelDecision } from "@/lib/intelligence/operator-actions";
import {
  DECISION_BADGE_CLASS,
  INTEL_STATE_BADGE_CLASS,
  SCORE_DIMENSIONS,
  activeFlags,
  appliedOverrideEntries,
  intelStateLabel,
  isReviewable,
  overrideIterationOptions,
  proposedDeltaEntries,
  scoreTone,
  type JobIntelView,
  type ScoreTone,
} from "@/lib/intelligence/view";

const SCORE_BAR_TONE: Record<ScoreTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

const SCORE_TEXT_TONE: Record<ScoreTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function IntelPanel({
  batchId,
  items,
}: {
  batchId: string;
  items: JobIntelView[];
}) {
  if (items.length === 0) return null;

  const escalated = items.filter((i) => i.intelState === "ESCALATED").length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">AI optimization</h2>
        <span className="text-xs text-muted-foreground">
          Every AI decision is shown here for review — nothing ships silently.
        </span>
        {escalated > 0 ? (
          <Badge variant="outline" className="border-warning/60 text-warning">
            <TriangleAlert aria-hidden />
            <span className="font-mono tabular-nums">{escalated}</span> need
            {escalated === 1 ? "s" : ""} human review
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <IntelJobCard key={item.jobId} batchId={batchId} item={item} />
        ))}
      </div>
    </section>
  );
}

function IntelJobCard({ batchId, item }: { batchId: string; item: JobIntelView }) {
  const escalated = item.intelState === "ESCALATED";
  const verdict = item.latestVerdict;
  const flags = activeFlags(verdict?.flags);
  const proposed = proposedDeltaEntries(verdict?.adjust);
  const applied = appliedOverrideEntries(
    item.appliedOverrides[item.appliedOverrides.length - 1] ?? null,
  );

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5",
        escalated ? "border-warning/60" : "border-border",
      )}
    >
      {/* Header: combo · state · iteration · cost */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-foreground">{item.comboLabel}</span>
        <Badge
          variant="outline"
          className={INTEL_STATE_BADGE_CLASS[item.intelState] ?? "border-border text-muted-foreground"}
        >
          {escalated ? <TriangleAlert aria-hidden /> : null}
          {intelStateLabel(item.intelState)}
        </Badge>
        {item.decision ? (
          <Badge
            variant="outline"
            className={DECISION_BADGE_CLASS[item.decision] ?? "border-border text-foreground"}
          >
            {item.decision}
          </Badge>
        ) : null}
        {item.recommendOnly ? (
          // INTEL-06: the trust gate is closed — the proposed deltas below were
          // recorded as a recommendation; a classic final shipped unchanged.
          <Badge variant="outline" className="border-info/50 text-info">
            recommend-only — deltas not applied
          </Badge>
        ) : null}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          iter {item.iteration} · {item.cost.visionCalls} vision ·{" "}
          {item.cost.previewRenders} preview · {item.cost.finalRenders} final
        </span>
      </div>

      {/* ESCALATED: distinct needs-human banner with the WHY + what to do */}
      {escalated ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-warning"
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-warning">
              Needs human — {item.escalateReason}
            </p>
            <p className="text-xs text-muted-foreground">
              The loop stopped without shipping. Review the preview below, then
              Accept to ship the best attempt, or Reject to re-queue a plain
              render without AI adjustments.
            </p>
          </div>
        </div>
      ) : null}

      {verdict ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[160px_minmax(180px,240px)_1fr]">
          {/* Preview thumbnail (auth-gated proxy) */}
          <div className="flex size-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {item.previewThumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewThumbUrl}
                alt={`AI-analyzed preview — ${item.comboLabel}`}
                className="size-full object-cover"
              />
            ) : (
              <ImageIcon
                className="size-6 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
            )}
          </div>

          {/* D1–D8 score bars */}
          <div className="flex flex-col justify-center gap-1.5">
            {SCORE_DIMENSIONS.map(({ key, dim, label }) => {
              const score = verdict.scores[key];
              const tone = scoreTone(score);
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-24 truncate text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                    <span className="font-mono">{dim}</span> {label}
                  </span>
                  <span className="flex gap-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        className={cn(
                          "h-1.5 w-4 rounded-full",
                          step <= score ? SCORE_BAR_TONE[tone] : "bg-muted",
                        )}
                      />
                    ))}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      SCORE_TEXT_TONE[tone],
                    )}
                  >
                    {score}
                  </span>
                </div>
              );
            })}
            <div className="mt-1 flex items-center gap-2">
              <span className="w-24 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                Overall
              </span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  SCORE_TEXT_TONE[scoreTone(verdict.overallScore)],
                )}
              >
                {verdict.overallScore} / 5
              </span>
            </div>
          </div>

          {/* Flags · deltas · rationale · links */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {flags.length > 0 ? (
                flags.map((flag) => (
                  <Badge key={flag} variant="destructive">
                    {flag}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">no flags raised</span>
              )}
            </div>

            <dl className="flex flex-col gap-1 text-xs">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">
                  {item.recommendOnly ? "Recommended" : "Proposed"}
                </dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {proposed.length > 0
                    ? proposed.map((d) => `${d.label} ${d.value}`).join(" · ")
                    : "none"}
                  {item.recommendOnly && proposed.length > 0 ? (
                    <span className="ml-1 font-sans text-muted-foreground">
                      (not applied)
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">Applied</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {applied.length > 0
                    ? applied.map((d) => `${d.label} ${d.value}`).join(" · ")
                    : "none"}
                </dd>
              </div>
              {item.guardrailHits.length > 0 ? (
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">Guardrails</dt>
                  <dd className="font-mono text-muted-foreground">
                    {item.guardrailHits.join(" · ")}
                  </dd>
                </div>
              ) : null}
            </dl>

            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
              {verdict.rationale}
            </blockquote>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {item.finalJobId ? (
                <Link
                  href={`/batches/${batchId}/gallery#${item.finalJobId}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Final render in gallery
                </Link>
              ) : null}
              {item.previewJobId ? (
                <span className="text-muted-foreground">
                  re-previewed as{" "}
                  <span className="font-mono">{item.previewJobId}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        // Calm in-progress / pre-verdict state — the loop still owns this job.
        <p className="text-sm text-muted-foreground">
          {item.intelState === "PREVIEW_QUEUED"
            ? "Preview render queued — the AI will score it once it completes."
            : escalated
              ? "No vision verdict was recorded for this job."
              : "Analyzing the preview… scores will appear here."}
        </p>
      )}

      <IntelReviewControls item={item} />
    </article>
  );
}

function IntelReviewControls({ item }: { item: JobIntelView }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const iterationOptions = overrideIterationOptions(item);
  const [overrideIteration, setOverrideIteration] = React.useState<string>(
    String(iterationOptions[iterationOptions.length - 1] ?? 0),
  );

  // Already reviewed: show the attributed decision (T-09-12) — no controls.
  if (item.operatorAction) {
    const a = item.operatorAction;
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className={
            a.action === "accept"
              ? "border-success/50 text-success"
              : a.action === "reject"
                ? "border-destructive/50 text-destructive"
                : "border-info/50 text-info"
          }
        >
          <Check aria-hidden />
          {a.action === "override"
            ? `override → iteration ${a.overrideIteration ?? "?"}`
            : `${a.action}ed`}
        </Badge>
        <span>
          reviewed {new Date(a.at).toLocaleString()} ·{" "}
          <span className="font-mono">{a.userId}</span>
        </span>
        {a.queuedJobId ? (
          <span>
            re-queued as <span className="font-mono">{a.queuedJobId}</span>
          </span>
        ) : null}
      </div>
    );
  }

  if (!isReviewable(item.intelState)) return null;

  function decide(input: {
    action: "accept" | "reject" | "override";
    overrideIteration?: number;
  }) {
    startTransition(async () => {
      const res = await applyIntelDecision({ jobId: item.jobId, ...input });
      if (res.ok) {
        toast.success(
          input.action === "accept"
            ? "Accepted — the AI result ships."
            : input.action === "reject"
              ? "Rejected — a plain render was re-queued without AI adjustments."
              : `Override applied — shipping iteration ${input.overrideIteration}.`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <Button
        className="h-11 px-5"
        disabled={pending}
        onClick={() => decide({ action: "accept" })}
      >
        <Check className="size-4" aria-hidden /> Accept
      </Button>
      <Button
        variant="outline"
        className="h-11 px-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={pending}
        onClick={() => decide({ action: "reject" })}
      >
        Reject — re-queue plain
      </Button>
      {iterationOptions.length > 1 ? (
        <div className="flex items-center gap-2">
          <Select
            value={overrideIteration}
            onValueChange={setOverrideIteration}
            disabled={pending}
          >
            <SelectTrigger className="h-11 w-44">
              <SelectValue placeholder="Pick iteration" />
            </SelectTrigger>
            <SelectContent>
              {iterationOptions.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  {i === 0 ? "Seed (no overrides)" : `Iteration ${i}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            className="h-11 px-4"
            disabled={pending}
            onClick={() =>
              decide({
                action: "override",
                overrideIteration: Number(overrideIteration),
              })
            }
          >
            <RotateCcw className="size-4" aria-hidden /> Ship this iteration
          </Button>
        </div>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {pending ? "Recording your decision…" : "Your decision is logged with your user and time."}
      </span>
    </div>
  );
}
