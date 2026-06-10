---
phase: 07-ui-design-system-polish
plan: 01
subsystem: ui
tags: [design-system, tailwind, semantic-tokens, theming, react]

requires:
  - phase: 02-product-workspace
    provides: group-assignment surface + globals.css semantic token layer
  - phase: 03-batch-builder
    provides: batch-builder + estimate-panel cost-guardrail surfaces
  - phase: 05-outputs-gallery
    provides: gallery layer-card with the inherited (filled) GROUP_CHIP map
provides:
  - All status colors in the builder/product surfaces flow through the semantic warning/info/success tokens (both themes)
  - A single shared stone-group chip class map (lib/groups/chip.ts) consumed by batch-builder + group-assignment
  - A source-text guard test pinning the no-raw-palette contract
affects: [phase-08-cutover-deploy]

tech-stack:
  added: []
  patterns:
    - "Semantic status tokens (warning/info/success + -foreground) are the ONLY vocabulary for status hue; raw Tailwind palette (amber-/sky-/emerald-NNN) is banned in these surfaces"
    - "Group chip color contract defined once in lib/ and imported by every call site (outline-style chips distinct from the gallery's filled-style GROUP_CHIP)"

key-files:
  created:
    - lib/groups/chip.ts
    - test/group-chip-tokens.test.ts
  modified:
    - app/(app)/products/[id]/batches/new/estimate-panel.tsx
    - app/(app)/products/[id]/batches/new/batch-builder.tsx
    - app/(app)/products/[id]/group-assignment.tsx

key-decisions:
  - "Mapped each raw color by SEMANTIC INTENT, not blind swap: emerald(safe/go)->success, amber(caution/warn)->warning, sky(info/submitting)->info"
  - "Did NOT reuse the gallery's GROUP_CHIP for the dedup — it is filled-style (bg-*/15) while the builder/assignment chips are outline-style (border-*/50); forcing one map would change the visual treatment. Created a separate outline-style shared map instead"
  - "UI-02 left as-is and confirmed already satisfied per the audit; Work Unit C is a no-op (no skeletons added to server-component pages)"

patterns-established:
  - "Status-token sweep: any new status-colored element must use warning/info/success utilities, enforced by test/group-chip-tokens.test.ts"

requirements-completed: [UI-01]

duration: 7min
completed: 2026-06-10
---

# Phase 7 Plan 01: UI Design System & Workflow Polish Summary

**Closed UI-01 by routing all 12 raw status-palette colors through the existing semantic warning/info/success tokens and collapsing the duplicated stone-group chip map into one shared, token-based source of truth — a targeted coherence sweep, not a redesign.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-10T04:38:52Z
- **Completed:** 2026-06-10T04:46:00Z
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

### Work Unit A — Status-token sweep (UI-01)

Replaced **12 raw Tailwind palette occurrences** with intent-mapped semantic tokens across 3 files:

| File | Occurrences | Swap |
|------|-------------|------|
| `estimate-panel.tsx` | 4 | `border-l-emerald-500/70`→`border-l-success/70`; `border-l-amber-500 border-amber-500/40`→`border-l-warning border-warning/40`; warn icon `text-amber-500`→`text-warning`; "Creating batch…" `text-sky-500`→`text-info` |
| `batch-builder.tsx` | 6 | chip `sky-500`→`info`, `amber-500`→`warning` (2 classes, folded into the shared map); 4 validation notices `text-amber-500`→`text-warning` |
| `group-assignment.tsx` | 4 | chip `sky-500`→`info`, `amber-500`→`warning` (2 classes, folded into shared map); 1 notice `text-amber-500`→`text-warning` |

The `--warning`/`--info`/`--success` (+ `-foreground`) tokens already exist in `app/globals.css` for **both** `:root` (light) and `.dark`, so contrast holds in both themes with no new tokens. No purple, no new dependencies.

### Work Unit B — De-dupe stone-group chip map

The divergent `STONE_GROUP_CHIP` (batch-builder) and `CHIP_CLASS` (group-assignment) maps were extracted into a single shared module:

**Shared map now lives at `lib/groups/chip.ts`** (`GROUP_CHIP_CLASS`), an outline-style, token-only map covering every key both call sites index (`alloycolour`, `diamond`, `stone2`, `stone3`, `unassigned`): diamond=primary, stone2=info, stone3=warning. Both surfaces import it; both local duplicates are deleted.

A guard test (`test/group-chip-tokens.test.ts`) asserts no `amber-/sky-/emerald-NNN` palette class survives in the 3 files, that the shared map is token-based (no palette, no purple), and that both call sites import it.

### Work Unit C — No-op (confirmed)

State coverage (UI-02) was already satisfied per the audit. No skeletons added to server-component pages. UI-02 left Complete.

## Validation Results

- **Vitest (full):** 47 files / **257 tests passed** (`npx vitest run`). Guard test: 5/5.
- **TypeScript:** `npx tsc --noEmit` exit **0**.
- **Build:** `npx next build` **succeeded** — all routes compiled, including `/products/[id]/batches/new` and `/products/[id]`.

## Requirements Completed

- **UI-01** — marked Complete (checkbox + traceability row).
- **UI-02** — confirmed already Complete (no change needed; audit-verified).

## Deviations from Plan

None of substance. The plan split Work Unit A (color swap) and Work Unit B (dedup) into two tasks; in practice the stone-group chip color swap is inseparable from the dedup (the same two class strings), so those two lines were swapped as part of the shared-map extraction rather than twice. The two atomic commits still cleanly separate "estimate-panel pure color swap" from "shared chip map + remaining notice swaps + guard test." No new tokens, deps, or purple introduced (constraints honored).

## Commits

- `c8a61a1` — fix(07-01): swap raw status palette for semantic tokens in estimate panel (UI-01)
- `ede0c07` — refactor(07-01): de-dupe stone-group chip map to one shared token source (UI-01)

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes (pure presentational token/class refactor).

## Self-Check: PASSED

- `lib/groups/chip.ts` — FOUND
- `test/group-chip-tokens.test.ts` — FOUND
- estimate-panel / batch-builder / group-assignment — modified, zero raw palette classes remain (grep clean)
- Commits `c8a61a1`, `ede0c07` — present in git log
