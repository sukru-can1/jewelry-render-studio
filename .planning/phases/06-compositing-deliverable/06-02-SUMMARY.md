---
phase: 06-compositing-deliverable
plan: 02
subsystem: compositing
tags: [compositing, COMP-01, COMP-02, ui, db-only, private-blob, blob-only]
requires:
  - "06-01 lib/compositing/variants.ts groupVariantsForCompositing() + Variant/CompositingLayer/LayerWithCombo types"
  - "06-01 lib/compositing/validate.ts FlattenWarning type"
  - "06-01 lib/compositing/deliverable.ts deliverablePathname()/deliverablePrefix()"
  - "06-01 app/(app)/batches/[id]/flatten/route.ts POST per-variant flatten (COMP-02)"
  - "Phase 5 lib/gallery/query.ts loadBatchGallery() (DB-only Layer rows + combos)"
  - "Phase 5 gallery/layer-card.tsx comboLabel/downloadName/GROUP_CHIP + gallery-checkerboard CSS"
  - "lib/blob.ts privateUrl() (auth-gated /api/file proxy, SEC-02)"
  - "lib/auth/rbac requireSession (auth boundary)"
provides:
  - "app/(app)/batches/[id]/compositing/page.tsx DB-only compositing Server Component (COMP-01)"
  - "app/(app)/batches/[id]/compositing/compositor.tsx LayerCompositor (stacked <img> + per-layer toggles + WARN banner)"
  - "app/(app)/batches/[id]/compositing/flatten-action.tsx per-variant Flatten & download (COMP-02→03 entry)"
  - "app/(app)/batches/[id]/segment-switcher.tsx Monitor · Gallery · Compositing nav"
  - "exported GROUP_CHIP from gallery/layer-card.tsx for reuse"
affects:
  - "06-03 download-all-deliverables drops into the page header slot + reuses the segment switcher"
tech-stack:
  added: []
  patterns:
    - "DB-only Server Component (requireSession first, IDOR by params.id, force-dynamic, Node runtime) mirroring gallery/page.tsx"
    - "blob-derived flattened count via list({prefix:deliverablePrefix(id)}) matched to enumerated variant deliverable pathnames — NEVER Layer.isFlattened"
    - "client-only preview composition: absolutely-positioned <img> stack on gallery-checkerboard, every src via privateUrl() → /api/file"
    - "route-driven flatten branching (ok:true download / ok:false WARN-not-silent / non-2xx error) — gate never re-derived client-side"
key-files:
  created:
    - app/(app)/batches/[id]/compositing/page.tsx
    - app/(app)/batches/[id]/compositing/compositor.tsx
    - app/(app)/batches/[id]/compositing/flatten-action.tsx
    - app/(app)/batches/[id]/segment-switcher.tsx
    - test/comp-page-db-only.test.ts
  modified:
    - test/orch-db-only.test.ts
    - app/(app)/batches/[id]/gallery/layer-card.tsx
decisions:
  - "Flattened count is BLOB-DERIVED (list by deliverable prefix, matched to enumerated variant deliverable pathnames); Layer.isFlattened stays all-false under blob-only persistence and is never read."
  - "Used Tailwind aspect-square (no shadcn aspect-ratio component exists in the registry) for the square preview frame."
  - "Segment switcher is plain Next Link styled like the inherited toggle-group (each segment is its own Server Component route) with a 44px hit-area; rendered on the compositing page only this plan."
  - "WARN state owned by LayerCompositor; FlattenAction hands warnings up via onWarnings so the banner sits above the frame and the button stays enabled (never a silent block)."
metrics:
  duration: ~12min
  completed: 2026-06-09
---

# Phase 6 Plan 02: In-Browser Compositing UI Summary

COMP-01 compositing surface — a DB-only `compositing/` route renders one
toggle-able LayerCompositor per (angle × metal) variant on the inherited
checkerboard via the private-blob proxy, with a per-variant Flatten & download that
calls the Plan-01 route and surfaces WARN (never silent), plus a Monitor · Gallery ·
Compositing segment switcher.

## What was built

- **`compositing/page.tsx`** — async Server Component, `runtime="nodejs"`,
  `dynamic="force-dynamic"`. `requireSession()` is the first line (T-06-06);
  IDOR-loads the batch via `loadBatchGallery(params.id)` (T-06-07) with the calm
  "Couldn't load this batch for compositing." fallback. Groups completed-job Layer
  rows with `groupVariantsForCompositing`, then groups variants by metal for the
  section layout. The `{d} flattened` summary is BLOB-DERIVED: `list({prefix:
  deliverablePrefix(id)})` matched against each variant's `deliverablePathname` —
  `Layer.isFlattened` is never read. States: loading (RSC), empty ("No composable
  layers yet" → View batch progress), error (calm DB-read fallback + Retry),
  in-progress (`info` banner from DB counts only). A `download-all-deliverables`
  slot is left for Plan 03.
- **`segment-switcher.tsx`** (`"use client"`) — Monitor · Gallery · Compositing
  links, 44px hit-area, active segment is the neutral-filled state.
- **`compositor.tsx`** (`"use client"`) — LayerCompositor per variant. Square
  `aspect-square` frame on `gallery-checkerboard` with absolutely-positioned `<img>`
  layers (metal base z=0 floor, stone overlays ascending z), every `src =
  privateUrl(layer.url)` → `/api/file` (T-06-08). Per-layer eye/eye-off `Toggle`
  flips opacity 1↔0 + dims the label; per-layer image-load error shows
  "Couldn't load this layer." + Retry while the rest still composes; reuses the
  exported `GROUP_CHIP`. Owns the WARN banner (shadcn `alert` + `warning` token,
  mono detail line) above the frame.
- **`flatten-action.tsx`** (`"use client"`) — secondary "Flatten & download"
  button. POSTs `/batches/<id>/flatten?angle=&metal=`. `ok:true` → downloads the
  deliverable through the `/api/file` attachment proxy + toast + "Deliverable
  ready" badge; `ok:false` → hands warnings up to the compositor (button stays
  enabled; `no-overlays` offers a "Flatten metal only" `&force=1` re-POST);
  non-2xx/network → destructive error toast. Empty-scope (no metal base) disables
  with the SPEC reason.
- **Guards** — new `test/comp-page-db-only.test.ts` (no RunPod import + requireSession
  + Node + force-dynamic asserts) and the compositing page added to
  `test/orch-db-only.test.ts` `DB_ONLY_FILES` as a hard gate.

## Deviations from Plan

**1. [Rule 3 - Blocking] No shadcn `aspect-ratio` component in the registry.**
- **Found during:** Task 2
- **Issue:** UI-SPEC/plan reference shadcn `aspect-ratio`, but it is not present in
  `app/components/ui/` (the registry has toggle/alert/badge/etc. but not aspect-ratio).
- **Fix:** Used the Tailwind `aspect-square` utility directly for the square preview
  frame — same visual result, zero new component/token, no dependency added.
- **Files:** `app/(app)/batches/[id]/compositing/compositor.tsx`

**2. [Rule 3 - Blocking] DB-only source guard tripped on the literal word "RunPod".**
- **Found during:** Task 1 verification
- **Issue:** The `\brunpod\b/i` guard matched the word "RunPod" inside an
  explanatory comment in `page.tsx`.
- **Fix:** Reworded the comment to "GPU dispatch error" — the page imports no
  RunPod I/O; only the comment text tripped the case-insensitive guard.
- **Files:** `app/(app)/batches/[id]/compositing/page.tsx`

## Verification

- `npx vitest run comp-page-db-only orch-db-only` — 8/8 GREEN.
- Full `npx vitest run` — 246/246 passed, 45 files. (One logged promise-rejection
  stack in `orch-reconcile.test.ts` is an expected in-test rejection, not a failure.)
- `npx tsc --noEmit` — exit 0, clean.
- `npx next build` — exit 0, "Compiled successfully", `/batches/[id]/compositing`
  emitted as a dynamic (ƒ) route (6.41 kB / 203 kB First Load).

## Self-Check: PASSED
