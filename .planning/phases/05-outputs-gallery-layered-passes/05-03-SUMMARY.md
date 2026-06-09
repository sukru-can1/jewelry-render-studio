---
phase: 05-outputs-gallery-layered-passes
plan: 03
subsystem: outputs-delivery
tags: [download, zip, blob, security, OUT-03]
requires: ["05-01"]
provides:
  - "GET /api/file?download=1&name= attachment download (sanitized Content-Disposition)"
  - "GET /batches/[id]/download auth-gated batch-scoped application/zip stream"
affects:
  - "Plan 05-04 gallery wires download buttons to these routes (pure wiring)"
tech-stack:
  added: []
  patterns:
    - "archiver 8 is ESM: `new ZipArchive()` (the callable `archiver('zip')` factory was removed)"
    - "Node->Web stream bridge: archive.pipe(PassThrough) -> Readable.toWeb() -> Response body"
    - "private-only blob delivery: get(pathname,{access:'private'}) per layer, never a public/signed URL"
key-files:
  created:
    - "app/(app)/batches/[id]/download/route.ts"
  modified:
    - "app/api/file/route.ts (Task 1, committed 3b06cde)"
    - "test/out-file-download.test.ts (Task 1)"
    - "test/out-zip-route.test.ts"
    - "test/blob-guard.test.ts"
decisions:
  - "Used archiver 8 named ZipArchive class instead of the removed callable factory; updated the test mock to match the real ESM export shape."
metrics:
  duration: "resume run (prior work interrupted by transient rate-limit)"
  completed: 2026-06-09
  tasks: 2
  files: 5
---

# Phase 5 Plan 03: Layered-Pass Download + Zip Delivery Summary

OUT-03 delivery layer: single-layer attachment download via the existing private
`/api/file` proxy, plus a NEW auth-gated, batch-scoped route that streams a batch's
layers as one `application/zip` — private-only, IDOR-scoped, sanitized filenames.

## What Was Built

- **Task 1 (committed `3b06cde`):** Extended `app/api/file/route.ts` with optional
  `download=1&name=<human>` params that add a sanitized `Content-Disposition: attachment`
  header (CR/LF + quotes + path separators stripped — header-injection / traversal guard).
  Inline preview path is byte-identical when `download` is absent. `requireSession()`
  stays the first line.
- **Task 2 (committed `3ac11aa`):** Created `app/(app)/batches/[id]/download/route.ts`
  (`runtime = "nodejs"`). `requireSession()` first line (catches the thrown Response ->
  returns it). Loads the batch by `params.id` (fail-closed 404), then derives the layer
  set from DB rows (`prisma.job.findMany({ where:{ batchId }, include:{ layers:true } })`)
  — never from caller pathnames. Optional `?scope=` narrows by `combo.metalKey`. Each layer
  is read via `get(layer.url,{access:"private"})` and appended to a `ZipArchive` piped
  through a `PassThrough` -> `Readable.toWeb()` -> `Response` (`application/zip`, sanitized
  attachment filename, streamed never buffered). Extended `test/blob-guard.test.ts` to assert
  the zip route reads private and constructs no public URL.

## Threat Mitigations (from plan threat_model)

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-05-04 Spoofing | `requireSession()` fail-closed 401, first line of both routes |
| T-05-05 Tampering (header injection) | `sanitizeFilename()` strips CR/LF + quotes + path separators in both routes |
| T-05-06 IDOR | zip layer set derived from DB rows loaded by `params.id`, not caller pathnames |
| T-05-07 Info disclosure | `get(...,{access:"private"})` only; blob-guard source test forbids public-URL construction |
| T-05-08 DoS | streamed (no buffer); `?scope=` documented for very large batches |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] archiver 8 is ESM with no callable default export**
- **Found during:** Task 2 verification (`tsc` error TS1192 "no default export"; runtime
  check confirmed `require('archiver')` returns an object, not a function — the callable
  `archiver('zip')` factory was removed in v8).
- **Fix:** Changed the route to `import { ZipArchive } from "archiver"` and `new ZipArchive()`;
  updated `test/out-zip-route.test.ts` mock from `{ default: () => ({...}) }` to a mocked
  `ZipArchive` class so the GREEN test exercises the real import shape.
- **Files modified:** `app/(app)/batches/[id]/download/route.ts`, `test/out-zip-route.test.ts`
- **Commit:** `3ac11aa`

**2. [Rule 3 - Blocking] Stale @ts-expect-error directives in out-zip-route test**
- **Found during:** Task 2 `tsc` (TS2578 unused directive — the route now exists).
- **Fix:** Removed the two `@ts-expect-error RED scaffold` directives.
- **Commit:** `3ac11aa`

## Deferred Issues (out of scope)

Two RED-scaffold test files for Plan 05-04 fail because their target modules do not
exist yet (`@/lib/gallery/group`, `@/lib/gallery/query`). Untouched by this plan; logged
in `deferred-items.md`. They go GREEN when 05-04 is executed.

## Verification

- `npx vitest run out-file-download out-zip-route blob-guard` -> 12/12 GREEN
- `npx vitest run` (full) -> 212 tests pass; only the 2 Plan-04 gallery RED scaffolds fail (deferred)
- `npx tsc --noEmit` -> exit 0
- `npx next build` -> succeeds; `/batches/[id]/download` route emitted
  (a transient `ENOSPC: no space left on device` was cleared by removing the stale
  `.next` cache; not a code issue)

## Self-Check: PASSED
- FOUND: app/(app)/batches/[id]/download/route.ts
- FOUND commit 3ac11aa (zip route + blob-guard + test mock)
- FOUND commit 3b06cde (Task 1 attachment download)
