"use client";

// UI-SPEC §1 — the client Batch Builder. Multi-select angle/metal/pass chips over the
// live Admin-editable domain, a per-PRESENT-group stone-type picker restricted to the
// generator-supported subset (BATCH-03), a quality select defaulting to preview
// (BATCH-06), the always-on live estimate panel with zone escalation, the soft-threshold
// confirmation dialog, and the hard-cap blocking alert. Submit calls the createBatch
// Server Action (Wave 1) — this surface holds NO authority; the server re-validates and
// re-caps. Geist Mono on every numeric; teal accent only on selected chips + the primary
// CTA; NO purple. `prefers-reduced-motion` is honored (instant; no count animation).

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aperture, Check, Gem, Layers, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  BATCH_LIMITS,
  countJobs,
  estimate as estimateModel,
  zone as zoneOf,
} from "@/lib/batches/estimate";
import { createBatch } from "@/lib/batches/actions";
import type { StoneGroupKey } from "@/lib/batches/builder-data";
import { GROUP_CHIP_CLASS } from "@/lib/groups/chip";
import { Button } from "@/app/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/app/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Switch } from "@/app/components/ui/switch";
import { TooltipProvider } from "@/app/components/ui/tooltip";

import { EstimatePanel } from "./estimate-panel";

type CameraView = { key: string; label: string; azimuth: number; elevation: number };
type Metal = { key: string; label: string; hex: string | null };
type StoneTypeOption = { key: string; label: string };
type QualityPreset = {
  key: string;
  label: string;
  samples: number;
  width: number;
  height: number;
};

const STONE_GROUP_LABEL: Record<StoneGroupKey, string> = {
  diamond: "diamond",
  stone2: "stone2",
  stone3: "stone3",
};
// Inherited group color contract (Phase 2 §4): diamond=primary, stone2=info, stone3=warning.
// The class map is the single shared source of truth (lib/groups/chip.ts).
const STONE_GROUP_CHIP = GROUP_CHIP_CLASS;

const SELECTED_CHIP =
  "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary border border-border";

export function BatchBuilder({
  productId,
  cameraViews,
  metals,
  stoneTypes,
  qualityPresets,
  presentStoneGroups,
  aiConfigured,
}: {
  productId: string;
  cameraViews: CameraView[];
  metals: Metal[];
  stoneTypes: StoneTypeOption[];
  qualityPresets: QualityPreset[];
  presentStoneGroups: StoneGroupKey[];
  /**
   * Server-resolved: OPENAI_API_KEY present AND the global kill-switch is not
   * "false". When false the toggle renders DISABLED with a note — the server
   * (createBatch G9 gate) decides regardless; this is display-only (INTEL-05).
   */
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── Selection state (guardrail-first defaults: first view + first metal only) ──
  const [angleKeys, setAngleKeys] = useState<string[]>(
    cameraViews.length > 0 ? [cameraViews[0].key] : [],
  );
  const defaultMetal =
    metals.find((m) => m.key === "white")?.key ?? metals[0]?.key;
  const [metalKeys, setMetalKeys] = useState<string[]>(
    defaultMetal ? [defaultMetal] : [],
  );
  // Passes: metal-only is a fixed key; one toggle per present stone group, default ON.
  const [passes, setPasses] = useState<string[]>([
    "metal",
    ...presentStoneGroups,
  ]);
  // Stone type per present group — default to the first supported catalog type.
  const defaultStoneType = stoneTypes[0]?.key;
  const [stoneTypeByGroup, setStoneTypeByGroup] = useState<
    Partial<Record<StoneGroupKey, string>>
  >(() => {
    const init: Partial<Record<StoneGroupKey, string>> = {};
    for (const g of presentStoneGroups) init[g] = defaultStoneType;
    return init;
  });
  // Quality defaults to "preview" (BATCH-06) — fall back to the first preset.
  const defaultQuality =
    qualityPresets.find((q) => q.key === "preview")?.key ??
    qualityPresets[0]?.key ??
    "";
  const [qualityKey, setQualityKey] = useState<string>(defaultQuality);
  // INTEL-05 opt-in: DEFAULT OFF — the adaptive loop never runs unrequested.
  const [optimizeWithAi, setOptimizeWithAi] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState(false);

  // ── Live estimate (debounced ~120ms; honors prefers-reduced-motion via instant set) ──
  const activeQuality =
    qualityPresets.find((q) => q.key === qualityKey) ?? qualityPresets[0];
  const samples = activeQuality?.samples ?? 64;
  const width = activeQuality?.width ?? 1920;
  const height = activeQuality?.height ?? 1920;

  // passCount = metal-only (if selected) + present+selected stone-group passes.
  const passCount = passes.length;
  const liveSelection = {
    angleCount: angleKeys.length,
    metalCount: metalKeys.length,
    passCount,
    samples,
  };

  const [debounced, setDebounced] = useState(liveSelection);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(liveSelection), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleKeys.length, metalKeys.length, passCount, samples]);

  const invalid =
    angleKeys.length === 0 || metalKeys.length === 0 || passes.length === 0;

  const est = useMemo(() => estimateModel(debounced), [debounced]);
  const jobs = countJobs(debounced);
  const currentZone = invalid ? "idle" : zoneOf(jobs);
  const overHardCap = currentZone === "block";
  const overSoftThreshold = currentZone === "warn";

  // ── Submit ──────────────────────────────────────────────────────────────────
  function doSubmit() {
    setErrorBanner(false);
    startTransition(async () => {
      const result = await createBatch({
        productId,
        angleViewKeys: angleKeys,
        metalKeys,
        stoneTypeByGroup,
        passes,
        qualityKey,
        // Only meaningful when the feature is configured; the server re-gates (G9).
        optimizeWithAi: aiConfigured && optimizeWithAi,
      });
      if (result.ok) {
        toast(`Batch created — ${result.jobCount} jobs queued.`, {
          action: {
            label: "View jobs",
            onClick: () => router.push(`/batches/${result.batchId}`),
          },
        });
        router.push(`/batches/${result.batchId}`);
      } else {
        setErrorBanner(true);
      }
    });
  }

  function onCreateClick() {
    if (invalid || overHardCap) return;
    if (overSoftThreshold) {
      setConfirmOpen(true);
      return;
    }
    doSubmit();
  }

  const submitting = pending;
  const disabled = submitting;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      {/* ── Selector column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* Angles */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Aperture className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Angles
            </span>
          </div>
          <ToggleGroup
            type="multiple"
            value={angleKeys}
            onValueChange={(v) => v.length > 0 && setAngleKeys(v)}
            className="flex-wrap"
            disabled={disabled}
          >
            {cameraViews.map((v) => (
              <ToggleGroupItem
                key={v.key}
                value={v.key}
                variant="outline"
                className={cn("h-auto flex-col items-start gap-0.5 px-3 py-2", SELECTED_CHIP)}
              >
                <span className="text-sm">{v.label}</span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  az {Math.round(v.azimuth)}° · el {Math.round(v.elevation)}°
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {angleKeys.length === 0 ? (
            <p className="text-sm text-warning">Select at least one angle to continue.</p>
          ) : null}
        </section>

        {/* Metals */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Metals
          </span>
          <ToggleGroup
            type="multiple"
            value={metalKeys}
            onValueChange={(v) => v.length > 0 && setMetalKeys(v)}
            className="flex-wrap"
            disabled={disabled}
          >
            {metals.map((m) => (
              <ToggleGroupItem
                key={m.key}
                value={m.key}
                variant="outline"
                className={cn("gap-2", SELECTED_CHIP)}
              >
                <span
                  className="size-4 rounded-sm border border-border"
                  style={{ backgroundColor: m.hex ?? "transparent" }}
                  aria-hidden
                />
                <span className="text-sm">{m.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {metalKeys.length === 0 ? (
            <p className="text-sm text-warning">Select at least one metal to continue.</p>
          ) : null}
        </section>

        {/* Stone types — one row per PRESENT group only, supported types only */}
        {presentStoneGroups.length > 0 ? (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Gem className="size-4 text-muted-foreground" strokeWidth={1.75} />
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Stone types
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Stone type sets the material for that group&apos;s pass. It doesn&apos;t add
              more jobs.
            </p>
            <div className="flex flex-col gap-3">
              {presentStoneGroups.map((g) => (
                <div key={g} className="flex items-center justify-between gap-4">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs",
                      STONE_GROUP_CHIP[g],
                    )}
                  >
                    {STONE_GROUP_LABEL[g]}
                  </span>
                  <Select
                    value={stoneTypeByGroup[g] ?? ""}
                    onValueChange={(val) =>
                      setStoneTypeByGroup((prev) => ({ ...prev, [g]: val }))
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select stone type" />
                    </SelectTrigger>
                    <SelectContent>
                      {stoneTypes.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Passes — metal-only fixed + one per present stone group */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Passes
            </span>
          </div>
          <ToggleGroup
            type="multiple"
            value={passes}
            onValueChange={(v) => v.length > 0 && setPasses(v)}
            className="flex-wrap"
            disabled={disabled}
          >
            <ToggleGroupItem
              value="metal"
              variant="outline"
              className={cn("h-auto flex-col items-start gap-0.5 px-3 py-2", SELECTED_CHIP)}
            >
              <span className="text-sm">metal-only</span>
              <span className="text-[10px] text-muted-foreground">
                The metal pass (JPEG) — the alloy on its own.
              </span>
            </ToggleGroupItem>
            {presentStoneGroups.map((g) => (
              <ToggleGroupItem
                key={g}
                value={g}
                variant="outline"
                className={cn("h-auto flex-col items-start gap-0.5 px-3 py-2", SELECTED_CHIP)}
              >
                <span className="text-sm">{g} pass</span>
                <span className="text-[10px] text-muted-foreground">
                  A transparent pass for {g}, with everything else held out.
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {passes.length === 0 ? (
            <p className="text-sm text-warning">Select at least one pass to continue.</p>
          ) : null}
        </section>

        {/* Quality — default preview */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Quality
          </span>
          <Select value={qualityKey} onValueChange={setQualityKey} disabled={disabled}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select quality" />
            </SelectTrigger>
            <SelectContent>
              {qualityPresets.map((q) => (
                <SelectItem key={q.key} value={q.key}>
                  <span className="flex items-center gap-2">
                    {q.label}
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {q.samples} samples · {q.width}×{q.height}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Preview is fast and cheap. Switch up only when you need final-quality renders.
          </p>
        </section>

        {/* Optimize with AI — INTEL-05 opt-in (default OFF; server re-gates G9) */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Optimize with AI
            </span>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-4">
            <label
              htmlFor="optimize-with-ai"
              className={cn(
                "flex flex-col gap-1",
                aiConfigured && !disabled ? "cursor-pointer" : "cursor-not-allowed",
                !aiConfigured && "opacity-60",
              )}
            >
              <span className="text-sm text-foreground">AI-reviewed render loop</span>
              <span className="text-xs text-muted-foreground">
                Adds <span className="font-mono tabular-nums">1</span> preview render +
                AI analysis per variant; the AI adjusts studio knobs within safe bounds.
                You review every result on the batch monitor — nothing ships silently.
              </span>
            </label>
            <Switch
              id="optimize-with-ai"
              checked={optimizeWithAi}
              onCheckedChange={setOptimizeWithAi}
              disabled={disabled || !aiConfigured}
              aria-label="Optimize with AI"
            />
          </div>
          {!aiConfigured ? (
            <p className="text-xs text-muted-foreground">
              AI optimization is not configured for this deployment — batches render
              the classic path. Ask an admin to set the AI key to enable it.
            </p>
          ) : null}
        </section>

        {/* Matrix summary read-back */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">
            {invalid ? "—" : jobs}
          </span>{" "}
          jobs — {angleKeys.length} angles × {metalKeys.length} metals ×{" "}
          {passes.length} passes at {activeQuality?.label ?? "preview"} (
          <span className="font-mono tabular-nums">
            {samples} samples, {width}×{height}
          </span>
          ).
          {presentStoneGroups.length > 0 ? (
            <>
              {" "}
              Stone types:{" "}
              {presentStoneGroups
                .map((g) => `${g}→${stoneTypeByGroup[g] ?? "—"}`)
                .join(", ")}
              .
            </>
          ) : null}
        </div>

        {/* Hard-cap blocking alert */}
        {overHardCap ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>
              That&apos;s over the {BATCH_LIMITS.HARD_CAP}-job limit
            </AlertTitle>
            <AlertDescription>
              This selection would create{" "}
              <span className="font-mono tabular-nums">{jobs}</span> jobs, past the{" "}
              {BATCH_LIMITS.HARD_CAP}-job cap. Narrow it down — fewer angles, metals, or
              passes — to bring it under the limit.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Over-soft-threshold inline notice */}
        {overSoftThreshold ? (
          <p className="text-sm text-warning">
            That&apos;s a large batch ({jobs} jobs, ~{Math.max(1, Math.round(est.minutes))}{" "}
            min, ~${est.costUsd.toFixed(2)}). You can still create it — you&apos;ll confirm
            first.
          </p>
        ) : null}

        {/* Error banner */}
        {errorBanner ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Couldn&apos;t create the batch</AlertTitle>
            <AlertDescription>
              Nothing was submitted — try again.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => router.back()} disabled={disabled}>
            Cancel
          </Button>
          <Button
            onClick={onCreateClick}
            disabled={disabled || invalid || overHardCap}
          >
            {submitting ? (
              "Creating batch…"
            ) : (
              <>
                <Check className="size-4" /> Create batch
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Estimate rail (sticky >=1024px / docked bar <1024px) ──────────────── */}
      <TooltipProvider>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto max-w-[1280px] lg:mx-0">
              <EstimatePanel
                jobs={jobs}
                minutes={est.minutes}
                costUsd={est.costUsd}
                zone={currentZone}
                angleCount={angleKeys.length}
                metalCount={metalKeys.length}
                passCount={passes.length}
                samples={samples}
                width={width}
                height={height}
                invalid={invalid}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Soft-threshold confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {jobs} jobs?</DialogTitle>
            <DialogDescription>
              This builds {jobs} render jobs — about{" "}
              {Math.max(1, Math.round(est.minutes))} minutes and ~$
              {est.costUsd.toFixed(2)} of GPU time. You can cancel the batch from Jobs
              once it&apos;s running. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                doSubmit();
              }}
            >
              Create {jobs} jobs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
