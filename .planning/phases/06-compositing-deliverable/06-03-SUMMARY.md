---
phase: 06-compositing-deliverable
plan: 03
subsystem: compositing-deliverable
tags: [download, zip, deliverable, blob, comp-03]
requires:
  - "06-01 (deliverablePathname/deliverablePrefix, flattenVariant, groupVariantsForCompositing)"
  - "06-02 (compositing page header slot, flatten-action single-variant /api/file download)"
  - "Phase 5 (ZipArchive streaming download route, /api/file attachment proxy, putPrivate)"
provides:
  - "GET /batches/[id]/download?deliverables=1 — capped-lazy-flatten deliverables zip"
  - "DownloadAllDeliverables batch action (primary teal button)"
affects:
  - "app/(app)/batches/[id]/download/route.ts"
  - "app/(app)/batches/[id]/compositing/page.tsx"
tech-stack:
  added: []
  patterns:
    - "Additive ?mode branch in an existing route (deliverables=1) preserving the default path byte-for-byte"
    - "Blob-prefix discovery of flattened deliverables (no DB isFlattened row — blob-only persistence)"
    - "Capped lazy work inside the 60s budget + partial-set note header"
key-files:
  created:
    - "test/comp-download-deliverables.test.ts"
    - "app/(app)/batches/[id]/compositing/download-all-action.tsx"
  modified:
    - "app/(app)/batches/[id]/download/route.ts"
    - "app/(app)/batches/[id]/compositing/page.tsx"
    - ".planning/REQUIREMENTS.md"
decisions:
  - "LAZY_FLATTEN_CAP = 10 (RESEARCH 60s strategy band 8–12) — bounds synchronous flattens per request"
  - "X-Deliverables-Note carries the partial-set message when variants are skipped (over cap or gate-blocked)"
  - "Single-variant download reuses 06-02 flatten-action /api/file attachment — no new single-case route added"
metrics:
  duration: "~13m"
  completed: "2026-06-09"
  tasks: 2
  files: 5
---

# Phase 6 Plan 03: Deliverable Downloads Summary

Whole-batch deliverables delivery for COMP-03: the existing `download/route.ts`
gains a `?deliverables=1` mode that zips ONLY the batch's flattened deliverable
blobs (discovered by blob prefix, lazily flattening up to 10 missing variants
within the 60s budget), plus a primary "Download all deliverables" batch button.

## What shipped

- **`download/route.ts` — `?deliverables=1` mode (Task 1).** Branches additively;
  the default raw-layer zip path is unchanged (regression-guarded). The new path
  enumerates the batch's (angle×metal) variants from completed-job Layer rows,
  discovers already-flattened deliverables via `list({prefix: deliverablePrefix(id)})`
  (BLOB-ONLY — no `isFlattened` DB row), lazily flattens any missing deliverable
  via the 06-01 `flattenVariant` core + `putPrivate` (capped at `LAZY_FLATTEN_CAP=10`),
  and streams an `application/zip` of the deliverable bytes read PRIVATELY. Over
  the cap or gate-blocked variants are skipped and reported in `X-Deliverables-Note`.
- **`download-all-action.tsx` (Task 2).** Primary teal `Button` streaming
  `/batches/[id]/download?deliverables=1` via a programmatic `<a>` GET; idle /
  preparing / started(toast) / error / empty-scope states with exact UI-SPEC copy.
  Wired into the compositing page header, replacing the Plan-02 slot; `flattenedCount`
  is the page's blob-derived `flattenedKeys.size`, so empty-scope disables correctly
  under blob-only persistence.

## Security / budget contract (threat model)

- **T-06-09 (Spoofing):** `requireSession()` is the first line; the deliverables path
  is reached only after auth (test asserts no `get`/`list`/`put` on 401).
- **T-06-10 (IDOR):** batch loaded by `params.id`; deliverable pathnames are derived
  from THIS batch's DB variants via `deliverablePathname`, never from caller input.
- **T-06-11 (Info disclosure):** every read is `get(...,{access:"private"})` and every
  write `putPrivate` — no public/signed URL. blob-guard source guard covers the route.
- **T-06-12 (DoS):** `LAZY_FLATTEN_CAP=10` bounds synchronous flattens; the zip is
  streamed (`Readable.toWeb`), never buffered; remainder noted, never overrunning 60s.

## Deviations from Plan

None — plan executed as written. (One implementation detail: the partial-set note is
delivered via the `X-Deliverables-Note` response header, which the plan offered as the
primary option over an in-zip manifest entry.)

## Verification

- `npx vitest run comp-download-deliverables blob-guard` — 15 passed.
- Full `npx vitest run` — 252 passed (46 files).
- `npx tsc --noEmit` — exit 0.
- `npx next build` — succeeds (compositing route 6.77 kB; download route compiled).

## REQUIREMENTS.md updates

- COMP-01, COMP-02, COMP-03 checkboxes confirmed `[x]` and traceability rows
  (Phase 6) confirmed **Complete** — their UI (06-02), server flatten (06-01), and
  download (06-03) surfaces all exist. Footer "Last updated" set to 2026-06-09
  recording Phase 6 completion.

## Self-Check: PASSED
- FOUND: test/comp-download-deliverables.test.ts
- FOUND: app/(app)/batches/[id]/compositing/download-all-action.tsx
- FOUND: app/(app)/batches/[id]/download/route.ts (modified)
- FOUND: app/(app)/batches/[id]/compositing/page.tsx (modified)
- FOUND commit e2d2891 (Task 1)
- FOUND commit c79dc3e (Task 2)
