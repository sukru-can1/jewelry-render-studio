---
phase: 05-outputs-gallery-layered-passes
plan: 04
subsystem: outputs-gallery
tags: [gallery, layers, lightbox, download, db-only, idor]
requires: ["05-02 (Layer derivation hook)", "05-03 (/api/file download + batch zip route)"]
provides:
  - "DB-only outputs gallery Server Component (/batches/[id]/gallery)"
  - "lib/gallery/query.loadBatchGallery (completed-jobs-only DB read)"
  - "lib/gallery/group.groupLayers (canonical-combo-key grouping)"
  - "preview lightbox + per-layer/full-set downloads wired to Plan-03 routes"
affects:
  - "app/(app)/batches/[id]/page.tsx (combo-key bug fix)"
  - "app/(app)/batches/[id]/jobs-monitor.tsx (View-in-gallery link)"
  - "app/globals.css (transparency checkerboard)"
tech-stack:
  added: []
  patterns: ["DB-only Server Component", "auth-gated /api/file img proxy", "shadcn dialog lightbox", "first-party CSS checkerboard"]
key-files:
  created:
    - lib/gallery/group.ts
    - lib/gallery/query.ts
    - app/(app)/batches/[id]/gallery/page.tsx
    - app/(app)/batches/[id]/gallery/layer-card.tsx
    - app/(app)/batches/[id]/gallery/gallery-controls.tsx
    - app/(app)/batches/[id]/gallery/preview-lightbox.tsx
  modified:
    - app/(app)/batches/[id]/page.tsx
    - app/(app)/batches/[id]/jobs-monitor.tsx
    - app/globals.css
    - test/orch-db-only.test.ts
    - test/out-gallery-group.test.ts
    - test/out-gallery-query.test.ts
decisions:
  - "Gallery groups by canonical combo keys (angleKey/metalKey/stoneGroup/pass); fed wrong angle/metal/stone keys it collapses to one bucket (guard test)"
  - "Interactive grid (controls+cards+lightbox) lives in one client component (gallery-controls.tsx) over data the DB-only Server Component preloads — no client fetching"
  - "Checkerboard is a first-party CSS pattern (two neutral greys, dark-aware) applied only behind PNG/stone layers; no aspect-ratio shadcn component added (first-party size-40 square instead)"
  - "page.tsx centralizes comboLabel — the monitor receives a pre-built label string, so the combo-key fix lives in one place"
  - "Gallery comments avoid the literal word 'RunPod' because the orch-db-only guard FORBIDDEN list includes /\\brunpod\\b/i"
metrics:
  duration: ~30min
  completed: 2026-06-09
---

# Phase 5 Plan 4: Outputs Gallery & Layered-Pass Browser Summary

DB-only outputs gallery that reads completed-job Layer rows, groups them by the correct combo keys, renders metal (solid) / stone (checkerboard) cards, opens a full-quality shadcn-dialog lightbox with prev/next, wires per-layer and full-set downloads to Plan-03's `/api/file` proxy and batch zip route, fixes the wrong-combo-keys bug in the monitor, and connects the Phase-4 "View in gallery" link — all private-blob-gated.

## What Shipped

- **lib/gallery/group.ts** — pure `groupLayers(rows, groupBy)` bucketing by canonical `angleKey/metalKey/stoneGroup/pass` (Metal default · Angle · Pass · Variant).
- **lib/gallery/query.ts** — `loadBatchGallery(id)`: batch + completed-jobs-only + their layers + per-status counts, DB-only (no GPU dispatch import). Returns null on missing/error for the calm inline state.
- **gallery/page.tsx** — Server Component: `requireSession()` first, IDOR by `params.id`, `force-dynamic`, header with layer count + primary "Download full set" → zip route, partial banner via `summarizeJobs/deriveBatchStatus` (DB-derived, no poll), empty / error states.
- **layer-card.tsx** — 160×160 thumbnail, PNG-on-checkerboard vs JPEG-on-`--card`, format badge, group chip (diamond=accent/stone2=info/stone3=warning), hover Download → `/api/file?...&download=1&name=`, error fallback; card opens the lightbox.
- **gallery-controls.tsx** — group-by toggle + JPEG/PNG filter chips (only shown when both formats present) + Clear + showing-count; grouped sections; owns lightbox index over the flattened section order.
- **preview-lightbox.tsx** — shadcn dialog, full-quality `<img>` via `privateUrl`, checkerboard/solid per pass, combo title + format/pass/group chips, mono metadata panel, Download layer + quiet Download full set, ←/→ prev/next, ESC + focus-trap from Radix.
- **Combo-key bug fix** — `batches/[id]/page.tsx comboLabel` now reads `angleKey/metalKey/stoneGroup/pass` (was `angle/metal/stone`, which collapsed every label to "render").
- **View-in-gallery wiring** — monitor `CompletedPreview` link repointed to `/batches/[id]/gallery#${jobId}`.
- **DB-only guard** — gallery page added to `test/orch-db-only.test.ts` `DB_ONLY_FILES`.

## Verification

- `npx vitest run out-gallery-group out-gallery-query` GREEN (4 tests).
- `npx vitest run` full suite GREEN — 38 files, 217 tests.
- `npx tsc --noEmit` exit 0.
- `npx next build` succeeds; `/batches/[id]/gallery` emitted (5.47 kB, no route collision).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed stale `@ts-expect-error` directives in RED scaffolds**
- **Found during:** Task 2 (tsc gate)
- **Issue:** Once `@/lib/gallery/group` and `@/lib/gallery/query` existed, the RED scaffolds' `@ts-expect-error` directives became unused, failing `tsc` (TS2578).
- **Fix:** Removed both directives; imports now resolve cleanly.
- **Files:** test/out-gallery-group.test.ts, test/out-gallery-query.test.ts
- **Commit:** 3597375

**2. [Rule 3 - Blocking] Avoided literal "RunPod" in gallery source comments**
- **Found during:** Task 2
- **Issue:** The orch-db-only guard FORBIDDEN list includes `/\brunpod\b/i`; descriptive comments mentioning "RunPod" would fail the new guard entry.
- **Fix:** Reworded comments to "GPU dispatch client" / "GPU dispatch poll".
- **Files:** app/(app)/batches/[id]/gallery/page.tsx
- **Commit:** 3597375

## Threat Model Compliance

- T-05-04 (Spoofing): `requireSession()` is the first line of the gallery Server Component.
- T-05-06 (IDOR): batch loaded by `params.id`; single-tenant posture.
- T-05-07 (Info disclosure): every `<img src>` is `privateUrl(pathname)` → `/api/file` proxy; never a raw worker image_url.
- T-05-09 (Tampering): DB-only Server Component; added to the orch-db-only source guard.

## Known Stubs

None — the gallery wires real Layer rows. The lightbox metadata panel currently shows layer/job ids + format + pass from the Layer row; richer per-layer metadata (samples, alpha-coverage %, render duration) is available via `Layer.metadataUrl` and can be hydrated in a follow-up if the validation pass requests it (not blocking the plan's goal).

## Manual Verification (PENDING)

Visual sign-off per 05-VALIDATION (open a completed batch's gallery — PNG-on-checkerboard, lightbox prev/next, layer + full-set download) is PENDING operator review.

## Self-Check: PASSED

All created files present; all three task commits (1b25d63, 3597375, 6955b66) found in history.
