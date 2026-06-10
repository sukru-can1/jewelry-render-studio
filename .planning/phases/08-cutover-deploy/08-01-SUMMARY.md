---
phase: 08-cutover-deploy
plan: 01
subsystem: cutover-deploy
tags: [security, cutover, deploy, legacy-retirement, SEC-05, DATA-05, DEPLOY-01]
requires: [SEC-01, DATA-01, SEC-02]
provides: [SEC-05, DATA-05, DEPLOY-01]
affects: [app, lib, api-routes]
tech-stack:
  added: []
  patterns: [verify-before-delete, met-by-rationale]
key-files:
  created:
    - .planning/phases/08-cutover-deploy/DATA-05-DECISION.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
  deleted:
    - app/enterprise-app.tsx
    - app/studio.tsx
    - app/lab/page.tsx
    - app/rater/page.tsx
    - app/default-recipe.json
    - app/styles.css
    - app/api/rating-sweeps/route.ts
    - app/api/render-jobs/route.ts
    - app/api/render-jobs/[id]/route.ts
    - app/api/material-inspections/route.ts
    - app/api/config/route.ts
    - lib/jobs.ts
decisions:
  - "DATA-05 satisfied met-by-rationale (no migration): legacy job history was disposable ring99 R&D in a rotated/inaccessible public Blob store; clean-slate Postgres product has no catalog history to migrate."
  - "Legacy render surfaces retired ENTIRELY (not just unlinked) — verified unused by the enterprise app/(app)/ product via grep before deletion."
  - "lib/types.ts left in place (NOT in the deletion scope; now an unused orphan — harmless, tsc stays green)."
metrics:
  duration: 40min
  completed: 2026-06-10
---

# Phase 8 Plan 01: Cutover & Deploy Summary

Retired the legacy single-purpose render surfaces entirely and removed the ring99
hardcodes (SEC-05), recorded the no-migration decision for the disposable legacy job
history (DATA-05, met-by-rationale), and verified the production Vercel deploy plus all
9 required env vars (DEPLOY-01) — closing milestone v1.0 at 8/8 phases, 41/41 requirements.

## What Was Built

This is a cutover phase: the deliverable is a *clean* enterprise-only product with no dead
legacy attack surface and no hardcoded asset references.

### Work Unit 1 — SEC-05: retire legacy surfaces + remove ring99 hardcodes

Deleted the verified-unused legacy cluster (whose only job was rendering the single
`ring99` test model — not linked from the enterprise `app/(app)/` product):

| Deleted | Why safe |
|---------|----------|
| `app/enterprise-app.tsx` | Legacy page; `/` is now a thin auth-redirect (`app/page.tsx`) |
| `app/studio.tsx` | Legacy paste-recipe sandbox (carried the ring99 recipe hardcode) |
| `app/lab/page.tsx` (+ `app/lab/`) | Only re-exported `studio.tsx` |
| `app/rater/page.tsx` (+ `app/rater/`) | Legacy rating UI; only fetched `/api/render-jobs` |
| `app/default-recipe.json` | Imported ONLY by `studio.tsx` |
| `app/styles.css` | Imported ONLY by `enterprise-app.tsx` (Phase-1 note confirmed it was scoped to it; `layout.tsx` uses `globals.css`) |
| `app/api/rating-sweeps/route.ts` | Carried the `u6oaq5xqg2yrxzlq.public.blob` URL + `outputs/ring99/recipes` local-FS read; fetched only by legacy pages |
| `app/api/render-jobs/route.ts` + `[id]/route.ts` | Legacy Blob job-state CRUD; fetched only by legacy pages |
| `app/api/material-inspections/route.ts` | Legacy inspection (new app uses the `(app)` inspection flow); fetched only by legacy pages |
| `app/api/config/route.ts` | Legacy env-presence probe; fetched only by legacy pages |
| `lib/jobs.ts` | Legacy Vercel-Blob job store; imported ONLY by the 4 legacy routes above |

**Verify-before-delete discipline (all gates passed AFTER the sweep):**
- `npx tsc --noEmit` → **exit 0** (a stale `.next/types/*` cache initially referenced the
  deleted routes; cleared `.next` and re-ran — real source is clean).
- `npx vitest run` → **257/257 green, 47 files** (no test referenced the deleted routes, so
  zero test removals were needed).
- `npx next build` → **succeeds**; route map shows a clean enterprise-only product (no
  `/lab`, `/rater`, `/api/render-jobs`, `/api/rating-sweeps`, `/api/material-inspections`,
  `/api/config`).

**Hardcode grep gate (live `app/`+`lib/` source):** zero references to `ring99`, the
`u6oaq5xqg2yrxzlq.public.blob` URL, and the `outputs/ring99/recipes` local-FS read.
Remaining `ring99` strings exist only as benign test fixtures (`models/ring99.glb`,
`outputs/ring99/job-abc.png` as arbitrary test model/output names) — NOT the SEC-05
hardcoded model URL or fallback recipe path.

### Work Unit 2 — DATA-05: no-migration decision (met-by-rationale)

Wrote `DATA-05-DECISION.md`. The legacy job history was scratch R&D for the single ring99
test model, lived in an old public Blob store whose access was rotated away (SEC-01), and
is not catalog work. The enterprise product is clean-slate (Postgres via Prisma), so there
is no production catalog history to migrate — and therefore no silent loss. The hypothetical
future path (an idempotent cursor-paginated backfill into a legacy-import container `Batch`)
is documented but explicitly NOT built. DATA-05 marked **Complete (met-by-rationale)**.

### Work Unit 3 — DEPLOY-01: production deploy + env-var verification

- Production URL **healthy**: `GET /` → **307** redirect to `/login?callbackUrl=…` (the
  deny-by-default auth boundary), `GET /login` → **200**.
- `vercel env ls production` (CLI authed) confirmed all **9 required env vars present** in
  Production — values shown only as `Encrypted` (no secret values exposed):
  `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`,
  `BLOB_READ_WRITE_TOKEN`, `RUNPOD_WEBHOOK_SECRET`, `CRON_SECRET`, `APP_URL` (plus a bonus
  `BLOB_ACCESS`). DEPLOY-01 marked **Complete**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale `.next/types/*` cache referenced deleted routes**
- **Found during:** Task 1 (first `tsc --noEmit` after deletions)
- **Issue:** tsc reported TS2307 "Cannot find module …/route.js" for every deleted route —
  all in `.next/types/` (generated artifacts from the previous build), not real source.
- **Fix:** `rm -rf .next` then re-ran tsc → exit 0. No source change.
- **Files modified:** none (build cache only).

### Scope notes (not deviations)

- **`lib/types.ts` kept.** It was imported only by the now-deleted legacy files, but it is
  NOT in the brief's explicit deletion list. Deleting it would be out of scope; leaving it as
  an unused orphan is harmless and tsc stays green. Recorded as a decision, not a deletion.
- **`.planning/ui-reviews/`** is a pre-existing untracked artifact unrelated to this phase —
  left untouched.

## Known Stubs

None. This phase only deletes code and updates planning docs.

## Threat Flags

None. SEC-05 *removes* attack surface (dead legacy routes + a public-Blob URL hardcode); it
introduces no new network endpoints, auth paths, or trust-boundary surface.

## Self-Check: PASSED

- Deleted files confirmed absent from working tree (git rm staged 12 deletions; empty
  `lab/`, `rater/`, and legacy `api/` dirs removed).
- Legacy-removal commit `8dba98b` present in `git log`.
- `DATA-05-DECISION.md`, `08-01-SUMMARY.md`, and updated REQUIREMENTS/STATE/ROADMAP present.
- tsc exit 0, vitest 257/257 green, next build succeeds (re-verified after the sweep).
