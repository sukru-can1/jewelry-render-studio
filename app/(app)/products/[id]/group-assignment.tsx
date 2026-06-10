"use client";

// UI-SPEC §4 — Object → group assignment. The core surface of Phase 2: the
// operator routes every detected MESH object into one of the four render groups
// (alloycolour / diamond / stone2 / stone3) or leaves it unassigned, then saves.
// The saved token lists are the holdout-pass shape Phase 3 consumes (PROD-04).
//
// suggestGroup() is imported from the pure lib/tokens module and used ONLY to
// render a dotted-teal "Suggested: {group}" hint — it is NEVER auto-applied
// (UI-SPEC §4: each suggestion is a hint the operator Accepts). Object/material
// names render as plain text (React escapes; no dangerouslySetInnerHTML — T-02-20).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HelpCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { InventoryObject, InventoryMaterial } from "@/lib/inventory";
import { classifyObject } from "@/lib/tokens";
import { detectScaleOutliers } from "@/lib/inspection/scale";
import { saveAssignments, type GroupTokenMap } from "@/lib/products/assignments";
import type { ObjectGroupKey } from "@/lib/validation/product";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/app/components/ui/radio-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { cn } from "@/lib/utils";
import { GROUP_CHIP_CLASS } from "@/lib/groups/chip";

const GROUP_OPTIONS: { key: ObjectGroupKey; label: string }[] = [
  { key: "alloycolour", label: "alloycolour" },
  { key: "diamond", label: "diamond" },
  { key: "stone2", label: "stone2" },
  { key: "stone3", label: "stone3" },
];

const UNASSIGNED = "unassigned";

const INTRO_HINT =
  "Assign each object to a group, then save. Groups decide which parts are rendered or held out in each pass.";
const HELPER_COPY =
  "alloycolour = the metal pass · diamond = the center stone · stone2 / stone3 = side stones. Unassigned objects won't appear in any pass.";

// Group-colored chip per UI-SPEC §4 color contract — single shared source of
// truth (lib/groups/chip.ts), token-based, no raw palette colors.
const CHIP_CLASS = GROUP_CHIP_CLASS;

type Selection = Record<string, ObjectGroupKey | typeof UNASSIGNED>;

function buildGroups(objects: InventoryObject[], selection: Selection): GroupTokenMap {
  const groups: GroupTokenMap = {
    alloycolour: [],
    diamond: [],
    stone2: [],
    stone3: [],
  };
  for (const obj of objects) {
    const choice = selection[obj.signature];
    if (choice && choice !== UNASSIGNED) {
      groups[choice]!.push(obj.signature);
    }
  }
  return groups;
}

function selectionFromAssignments(
  objects: InventoryObject[],
  assignments: GroupTokenMap,
): Selection {
  const bySignature: Selection = {};
  for (const obj of objects) bySignature[obj.signature] = UNASSIGNED;
  for (const [group, tokens] of Object.entries(assignments)) {
    for (const token of tokens ?? []) {
      // Only hydrate signatures that exist in the current inventory.
      if (token in bySignature) bySignature[token] = group as ObjectGroupKey;
    }
  }
  return bySignature;
}

function sameSelection(a: Selection, b: Selection): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

export function GroupAssignment({
  productId,
  objects,
  materials,
  initialAssignments,
}: {
  productId: string;
  objects: InventoryObject[];
  materials: InventoryMaterial[];
  initialAssignments: GroupTokenMap;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => selectionFromAssignments(objects, initialAssignments),
    [objects, initialAssignments],
  );
  const [selection, setSelection] = useState<Selection>(initial);
  const [saving, setSaving] = useState(false);

  // Scale-outlier warning: a single giant object mis-frames every render.
  const scaleOutliers = useMemo(() => detectScaleOutliers(objects), [objects]);

  const dirty = !sameSelection(selection, initial);
  const unassignedCount = objects.filter(
    (o) => (selection[o.signature] ?? UNASSIGNED) === UNASSIGNED,
  ).length;

  function setGroup(signature: string, group: ObjectGroupKey | typeof UNASSIGNED) {
    setSelection((prev) => ({ ...prev, [signature]: group }));
  }

  // Token-assist bulk action: assign every object whose signature contains
  // *metal* to alloycolour, with a preview count and toast undo (UI-SPEC §4).
  function assignAllMetal() {
    const matches = objects.filter((o) => o.signature.includes("metal"));
    if (matches.length === 0) {
      toast("No objects match *metal*.");
      return;
    }
    const before = selection;
    setSelection((prev) => {
      const next = { ...prev };
      for (const o of matches) next[o.signature] = "alloycolour";
      return next;
    });
    toast(`Assigned ${matches.length} matching *metal* → alloycolour.`, {
      action: { label: "Undo", onClick: () => setSelection(before) },
    });
  }

  // Bulk auto-assign: apply classifyObject() to every UNASSIGNED object (skip
  // objects already assigned and objects with no suggestion). Operator still
  // saves manually. Mirrors assignAllMetal's capture-before / Undo pattern.
  function assignAllSuggestions() {
    const targets = objects
      .filter((o) => (selection[o.signature] ?? UNASSIGNED) === UNASSIGNED)
      .map((o) => ({ obj: o, group: classifyObject(o, materials) }))
      .filter((t): t is { obj: InventoryObject; group: string } => t.group !== null);
    if (targets.length === 0) {
      toast("No suggestions for the remaining unassigned objects.");
      return;
    }
    const before = selection;
    setSelection((prev) => {
      const next = { ...prev };
      for (const { obj, group } of targets) {
        next[obj.signature] = group as ObjectGroupKey;
      }
      return next;
    });
    toast(`Auto-assigned ${targets.length} suggestion${targets.length === 1 ? "" : "s"}.`, {
      action: { label: "Undo", onClick: () => setSelection(before) },
    });
  }

  async function onSave() {
    setSaving(true);
    try {
      const result = await saveAssignments(productId, buildGroups(objects, selection));
      if (result.ok) {
        toast("Groups saved.");
        router.refresh();
      } else {
        toast("Couldn't save groups. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (objects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No objects to assign yet. Run material inspection first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Intro hint + group-meaning helper */}
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">{INTRO_HINT}</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5">
              <HelpCircle className="size-4" strokeWidth={1.75} />
              What do groups mean?
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-sm text-muted-foreground">
            {HELPER_COPY}
          </PopoverContent>
        </Popover>
      </div>

      {/* Scale-outlier warning banner — a giant object mis-frames every render. */}
      {scaleOutliers.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          {scaleOutliers.slice(0, 3).map((o) => (
            <div key={o.name} className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span>
                <span className="font-mono">{o.name || "—"}</span> is ~{o.ratio}× larger than
                the other parts — likely a scale issue in the model; renders may be mis-framed.
                Fix the model&apos;s scale before rendering.
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Token-assist bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
        <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
        <span className="text-sm text-muted-foreground">Token-assist</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={assignAllMetal}>
            Assign all matching <span className="mx-1 font-mono">*metal*</span> → alloycolour
          </Button>
          <Button variant="secondary" size="sm" onClick={assignAllSuggestions}>
            Auto-assign all suggestions
          </Button>
        </div>
      </div>

      {/* Assignment rows */}
      <div className="overflow-hidden rounded-lg border border-border">
        {objects.map((obj) => {
          const current = selection[obj.signature] ?? UNASSIGNED;
          const suggestion = classifyObject(obj, materials);
          const showSuggestion =
            suggestion !== null && current === UNASSIGNED;

          return (
            <div
              key={obj.signature}
              className="flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm text-foreground">{obj.name || "—"}</span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", CHIP_CLASS[current])}
                  >
                    {current}
                  </Badge>
                  {showSuggestion ? (
                    <button
                      type="button"
                      onClick={() => setGroup(obj.signature, suggestion as ObjectGroupKey)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
                    >
                      Suggested: {suggestion} → Accept
                    </button>
                  ) : null}
                </div>
              </div>

              <RadioGroup
                value={current}
                onValueChange={(v) =>
                  setGroup(obj.signature, v as ObjectGroupKey | typeof UNASSIGNED)
                }
                className="flex flex-wrap items-center gap-x-4 gap-y-2"
              >
                {[...GROUP_OPTIONS, { key: UNASSIGNED, label: "unassigned" }].map((opt) => {
                  const id = `${obj.signature}-${opt.key}`;
                  return (
                    <label
                      key={opt.key}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground"
                    >
                      <RadioGroupItem id={id} value={opt.key} />
                      <span className={cn(opt.key === UNASSIGNED && "text-muted-foreground")}>
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          );
        })}
      </div>

      {/* Incomplete-on-save note (non-blocking) */}
      {unassignedCount > 0 ? (
        <p className="text-sm text-warning">
          {unassignedCount} {unassignedCount === 1 ? "object is" : "objects are"} still
          unassigned and won&apos;t appear in any pass.
        </p>
      ) : null}

      {/* Sticky save bar — appears when dirty */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-3 px-6 py-3">
            <Button
              variant="ghost"
              onClick={() => setSelection(initial)}
              disabled={saving}
            >
              Discard
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save groups
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
