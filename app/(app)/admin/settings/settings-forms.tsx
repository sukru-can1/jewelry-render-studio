"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  saveCameraViews,
  saveMetals,
  saveQualityPresets,
  saveStoneTypes,
} from "@/lib/settings/actions";
import {
  cameraViewSchema,
  metalSchema,
  qualityPresetSchema,
  stoneTypeSchema,
} from "@/lib/validation/settings";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

// UI-SPEC §5 — Domain settings EDIT (Admin). Upgrades the Phase 1 read-only view
// to editable forms. Each section is validated CLIENT-SIDE with the SAME
// lib/validation/settings schemas the server actions use, so the inline error
// copy matches the spec verbatim; the server action is still the authoritative
// boundary (AUTH-05 — requireRole('Admin') first line). A sticky save bar appears
// when a section is dirty.

type CameraViewRow = {
  id: string;
  key: string;
  label: string;
  azimuth: number;
  elevation: number;
  focalMm: number;
  fStop: number;
};
type MetalRow = { id: string; key: string; label: string; hex: string | null };
type StoneTypeRow = { id: string; key: string; label: string };
type QualityPresetRow = {
  id: string;
  key: string;
  label: string;
  samples: number;
  width: number;
  height: number;
};

export type SettingsData = {
  cameraViews: CameraViewRow[];
  metals: MetalRow[];
  stoneTypes: StoneTypeRow[];
  qualityPresets: QualityPresetRow[];
};

const APPLIES_NOTE =
  "Changes apply to new batches, not to renders already created.";

// First zod issue message for a given field path, or undefined.
function firstError(
  issues: { path: (string | number)[]; message: string }[],
  index: number,
  field: string,
): string | undefined {
  return issues.find((i) => i.path[0] === index && i.path[1] === field)
    ?.message;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        {children}
      </div>
    </section>
  );
}

function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-sm text-muted-foreground">{APPLIES_NOTE}</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

type SaveResult =
  | { ok: true }
  | { ok: false; forbidden: true }
  | { ok: false; issues: unknown };

// Shared save handler: toast success/forbidden/failure per the copy contract.
function useSectionSave() {
  const [saving, setSaving] = React.useState(false);
  const run = React.useCallback(
    async (action: () => Promise<SaveResult>, onSuccess: () => void) => {
      setSaving(true);
      try {
        const result = await action();
        if (result.ok) {
          toast.success("Changes saved.", { description: APPLIES_NOTE });
          onSuccess();
        } else if ("forbidden" in result && result.forbidden) {
          toast.error("You don't have access to change these settings.");
        } else {
          toast.error("Couldn't save changes. Try again.");
        }
      } catch {
        toast.error("Couldn't save changes. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );
  return { saving, run };
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  error?: string;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        className="font-mono tabular-nums"
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CameraViewsForm({ initial }: { initial: CameraViewRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [issues, setIssues] = React.useState<
    { path: (string | number)[]; message: string }[]
  >([]);
  const { saving, run } = useSectionSave();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function update(i: number, patch: Partial<CameraViewRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    const payload = rows.map((r) => ({
      key: r.key,
      label: r.label,
      azimuth: r.azimuth,
      elevation: r.elevation,
      focalMm: r.focalMm,
      fStop: r.fStop,
    }));
    const parsed = cameraViewSchema.array().safeParse(payload);
    if (!parsed.success) {
      setIssues(parsed.error.issues);
      return;
    }
    setIssues([]);
    run(() => saveCameraViews(payload), () => undefined);
  }

  return (
    <Section
      title="Camera views"
      description="Angle, elevation, focal length, and aperture per catalog view."
    >
      <div className="flex flex-col gap-4">
        {rows.map((v, i) => (
          <div key={v.id} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{v.label}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField
                id={`cv-${v.id}-az`}
                label="Azimuth"
                value={v.azimuth}
                step="1"
                onChange={(n) => update(i, { azimuth: n })}
                error={firstError(issues, i, "azimuth")}
              />
              <NumberField
                id={`cv-${v.id}-el`}
                label="Elevation"
                value={v.elevation}
                step="1"
                onChange={(n) => update(i, { elevation: n })}
                error={firstError(issues, i, "elevation")}
              />
              <NumberField
                id={`cv-${v.id}-focal`}
                label="Focal (mm)"
                value={v.focalMm}
                step="1"
                onChange={(n) => update(i, { focalMm: n })}
                error={firstError(issues, i, "focalMm")}
              />
              <NumberField
                id={`cv-${v.id}-fstop`}
                label="f-stop"
                value={v.fStop}
                step="0.1"
                onChange={(n) => update(i, { fStop: n })}
                error={firstError(issues, i, "fStop")}
              />
            </div>
            {i < rows.length - 1 ? <Separator /> : null}
          </div>
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => {
          setRows(initial);
          setIssues([]);
        }}
      />
    </Section>
  );
}

function MetalsForm({ initial }: { initial: MetalRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [issues, setIssues] = React.useState<
    { path: (string | number)[]; message: string }[]
  >([]);
  const { saving, run } = useSectionSave();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function update(i: number, patch: Partial<MetalRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    const payload = rows.map((r) => ({
      key: r.key,
      label: r.label,
      hex: r.hex ?? "",
    }));
    const parsed = metalSchema.array().safeParse(payload);
    if (!parsed.success) {
      setIssues(parsed.error.issues);
      return;
    }
    setIssues([]);
    run(() => saveMetals(payload), () => undefined);
  }

  return (
    <Section title="Metals" description="Catalog metal colors with their swatch hex.">
      <div className="flex flex-col gap-4">
        {rows.map((m, i) => {
          const hexError = firstError(issues, i, "hex");
          return (
            <div key={m.id} className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`metal-${m.id}-label`} className="text-xs">
                    Label
                  </Label>
                  <Input
                    id={`metal-${m.id}-label`}
                    value={m.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`metal-${m.id}-hex`} className="text-xs">
                    Hex
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Pick ${m.label} color`}
                          className="size-6 rounded border border-border"
                          style={{ backgroundColor: m.hex ?? "transparent" }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2">
                        <input
                          type="color"
                          value={m.hex ?? "#000000"}
                          onChange={(e) =>
                            update(i, { hex: e.target.value.toUpperCase() })
                          }
                          className="h-10 w-16 cursor-pointer rounded border border-border bg-transparent"
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      id={`metal-${m.id}-hex`}
                      className="w-32 font-mono tabular-nums"
                      value={m.hex ?? ""}
                      onChange={(e) => update(i, { hex: e.target.value })}
                      aria-invalid={hexError ? true : undefined}
                    />
                  </div>
                  {hexError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {hexError}
                    </p>
                  ) : null}
                </div>
              </div>
              {i < rows.length - 1 ? <Separator /> : null}
            </div>
          );
        })}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => {
          setRows(initial);
          setIssues([]);
        }}
      />
    </Section>
  );
}

function StoneTypesForm({ initial }: { initial: StoneTypeRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [issues, setIssues] = React.useState<
    { path: (string | number)[]; message: string }[]
  >([]);
  const { saving, run } = useSectionSave();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function update(i: number, patch: Partial<StoneTypeRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { id: `new-${Date.now()}`, key: "", label: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    const payload = rows.map((r) => ({ key: r.key, label: r.label }));
    const parsed = stoneTypeSchema.array().safeParse(payload);
    if (!parsed.success) {
      setIssues(parsed.error.issues);
      return;
    }
    setIssues([]);
    run(() => saveStoneTypes(payload), () => undefined);
  }

  return (
    <Section
      title="Stone types"
      description="The gemstone catalog. Add, rename, or remove rows. Identifiers are machine keys."
    >
      <div className="flex flex-col gap-3">
        {rows.map((s, i) => {
          const keyError = firstError(issues, i, "key");
          const labelError = firstError(issues, i, "label");
          return (
            <div
              key={s.id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`stone-${s.id}-key`} className="text-xs">
                  Identifier
                </Label>
                <Input
                  id={`stone-${s.id}-key`}
                  className="font-mono"
                  value={s.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                  aria-invalid={keyError ? true : undefined}
                />
                {keyError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {keyError}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`stone-${s.id}-label`} className="text-xs">
                  Label
                </Label>
                <Input
                  id={`stone-${s.id}-label`}
                  value={s.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  aria-invalid={labelError ? true : undefined}
                />
                {labelError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {labelError}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label={`Remove ${s.label || s.key}`}
                onClick={() => removeRow(i)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="secondary" className="w-fit" onClick={addRow}>
          <Plus />
          Add stone type
        </Button>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => {
          setRows(initial);
          setIssues([]);
        }}
      />
    </Section>
  );
}

function QualityPresetsForm({ initial }: { initial: QualityPresetRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [issues, setIssues] = React.useState<
    { path: (string | number)[]; message: string }[]
  >([]);
  const { saving, run } = useSectionSave();
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function update(i: number, patch: Partial<QualityPresetRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    const payload = rows.map((r) => ({
      key: r.key,
      label: r.label,
      samples: r.samples,
      width: r.width,
      height: r.height,
    }));
    const parsed = qualityPresetSchema.array().safeParse(payload);
    if (!parsed.success) {
      setIssues(parsed.error.issues);
      return;
    }
    setIssues([]);
    run(() => saveQualityPresets(payload), () => undefined);
  }

  return (
    <Section
      title="Quality presets"
      description="Cycles sample counts per preset. All presets render at 1920×1920."
    >
      <div className="flex flex-col gap-4">
        {rows.map((q, i) => (
          <div
            key={q.id}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
          >
            <p className="text-sm font-medium text-foreground sm:pb-2">
              {q.label}
            </p>
            <NumberField
              id={`qp-${q.id}-samples`}
              label="Samples"
              value={q.samples}
              step="1"
              onChange={(n) => update(i, { samples: n })}
              error={firstError(issues, i, "samples")}
            />
            <p className="font-mono tabular-nums text-sm text-muted-foreground sm:pb-2">
              {q.width}×{q.height}
            </p>
          </div>
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => {
          setRows(initial);
          setIssues([]);
        }}
      />
    </Section>
  );
}

export function SettingsForms({ data }: { data: SettingsData }) {
  return (
    <Tabs defaultValue="camera" className="w-full">
      <TabsList>
        <TabsTrigger value="camera">Camera views</TabsTrigger>
        <TabsTrigger value="metals">Metals</TabsTrigger>
        <TabsTrigger value="stones">Stone types</TabsTrigger>
        <TabsTrigger value="quality">Quality</TabsTrigger>
      </TabsList>
      <TabsContent value="camera">
        <CameraViewsForm initial={data.cameraViews} />
      </TabsContent>
      <TabsContent value="metals">
        <MetalsForm initial={data.metals} />
      </TabsContent>
      <TabsContent value="stones">
        <StoneTypesForm initial={data.stoneTypes} />
      </TabsContent>
      <TabsContent value="quality">
        <QualityPresetsForm initial={data.qualityPresets} />
      </TabsContent>
    </Tabs>
  );
}
