---
phase: 04-orchestration-status
plan: 06
subsystem: orchestration-status
tags: [orch-04, orch-05, orch-03, orch-02, batches, monitor, db-only, cancel, freshness]
requires:
  - "lib/orchestration/batch-status.ts (batchProgress, deriveBatchStatus, summarizeJobs)"
  - "lib/orchestration/cancel.ts (cancelBatch, cancelJob Server Actions — Wave 2)"
  - "lib/orchestration/status-map.ts (isTerminal, TERMINAL_STATUSES)"
  - "app/api/batches/[id]/status/route.ts (DB-only freshness poll source — Wave 3)"
  - "app/(app)/batches/{status-pill,aggregate-bar}.tsx (Wave 3)"
  - "lib/auth/rbac.ts (requireSession); lib/db/prisma.ts (prisma singleton)"
  - "app/components/ui {table, toggle-group, button, badge, sonner}"
provides:
  - "app/(app)/batches/[id]/page.tsx (batch detail monitor RSC — requireSession + IDOR + DB-only)"
  - "app/(app)/batches/[id]/jobs-monitor.tsx (client jobs table + status filter + freshness poll + row expand)"
  - "app/(app)/batches/[id]/error-log.tsx (bounded mono stdout/stderr tail + Copy)"
  - "app/(app)/batches/[id]/freshness.tsx (updated Ns ago chip + Refresh)"
  - "app/(app)/batches/[id]/cancel-controls.tsx (CancelBatchControl, CancelJobControl)"
  - "app/components/ui/scroll-area.tsx, app/components/ui/alert-dialog.tsx (official shadcn primitives)"
  - "lib/orchestration/monitor-config.ts (MONITOR_POLL_MS — env-tunable freshness interval)"
affects:
  - "Phase 5 Gallery (consumes the reserved 'View in gallery' link target + completed-job thumbnail)"
tech-stack:
  added: []
  patterns:
    - "DB-only monitor: first paint from prisma in the RSC, client reseed via the DB-only status route (no GPU dispatch client import anywhere in the batches tree)"
    - "Immediate-cancel model A (04-04): optimistic 'cancelling' label is a brief client concern; the Server Action already persisted 'cancelled' — no reconcile two-step"
    - "Freshness poll interval centralized in lib/orchestration/monitor-config.ts (env NEXT_PUBLIC_MONITOR_POLL_MS), auto-stop on terminal"
key-files:
  created:
    - "app/(app)/batches/[id]/page.tsx"
    - "app/(app)/batches/[id]/jobs-monitor.tsx"
    - "app/(app)/batches/[id]/error-log.tsx"
    - "app/(app)/batches/[id]/freshness.tsx"
    - "app/(app)/batches/[id]/cancel-controls.tsx"
    - "app/components/ui/scroll-area.tsx"
    - "app/components/ui/alert-dialog.tsx"
    - "lib/orchestration/monitor-config.ts"
  modified:
    - "test/orch-db-only.test.ts (hardened to a hard gate)"
    - "app/api/batches/[id]/status/route.ts (header prose reword for the broadened token guard)"
decisions:
  - "Manual 'Retry failed jobs' descoped (UI-SPEC optional); the terminal-with-failures header shows a 'Rebuild from product' secondary link, and the read-only Attempt column (auto-retry, Wave 2) satisfies ORCH-03"
  - "Freshness route does not carry combo/error/thumbnail; the client merges those fields from the first-paint seed by job id on each poll (status/attempt/timestamps come from the route)"
  - "Completed-job thumbnail reads a single Layer url (flattened preferred); the full layered gallery is reserved for Phase 5 ('View in gallery' link target only)"
  - "scroll-area + alert-dialog added via the unified radix-ui package to match the existing app/components/ui style (no third-party registry, no new npm dep)"
metrics:
  duration: "~30m"
  completed: 2026-06-09
  tasks: 3
  files: 10
---

# Phase 04 Plan 06: Batch Detail Jobs Monitor (DB-only) Summary

The centerpiece operator surface — the batch detail / jobs monitor at `/batches/[id]` — composing the Wave 3 progress engine + aggregate bar + status pills with a dense jobs table, a collapsible monospace error-log viewer, a freshness DB-poll chip (auto-stop on terminal), and the Wave 2 cancel batch/job controls behind destructive confirms — all reading Postgres only, with the DB-only contract now locked by a hard source test.

## What Was Built

- **Task 1 — `scroll-area.tsx` + `alert-dialog.tsx`** (commit `86c7ac8`): the two official shadcn primitives the monitor needs, written via the unified `radix-ui` package to match the inherited `app/components/ui/` style (new-york tokens, `cn`, `buttonVariants`). `scroll-area` backs the bounded error-log body; `alert-dialog` backs the destructive cancel confirm. No third-party registry, no new npm dependency.
- **Task 2 — batch detail monitor** (commit `59f6b5b`): `app/(app)/batches/[id]/page.tsx` is an async RSC (`runtime="nodejs"`, `dynamic="force-dynamic"`): `requireSession()` first (T-04-10), IDOR-load the batch with product + jobs + layers (T-04-11, calm inline "Couldn't load this batch." on miss), compute `batchProgress`/`deriveBatchStatus` for the first paint, render the header (product name + mono batch id + derived `BatchStatusPill`, optional "Rebuild from product" when terminal-with-failures, `CancelBatchControl`), and seed the client `<JobsMonitor>`. The page imports `prisma` + `batch-status` + `status-map` ONLY — never the GPU dispatch client (ORCH-02). `jobs-monitor.tsx` (`"use client"`): dense jobs `Table` (Combo mono · `JobStatusPill` · Attempt `n / 2` with a `rotate-cw` glyph when >1 · live-ticking Duration · per-row Cancel), a `ToggleGroup` status filter with mono counts, row-expand → `<ErrorLog>` for failed / a 160×160 thumbnail + "View in gallery" link for completed, and the freshness poll: it `fetch`es `/api/batches/[id]/status` at `MONITOR_POLL_MS` while non-terminal, reseeds the table + aggregate (merging combo/error/thumbnail from the seed by id), and auto-stops on a terminal batch. `error-log.tsx`: collapsed-by-parent, monospace, `scroll-area`-bounded (~280px) stdout/stderr tail of `Job.error` with the one-line plain summary + Copy ghost ("Log copied." toast) + empty state. `freshness.tsx`: the muted "updated Ns ago" mono chip (1s tick) + Refresh ghost icon-button, fresh/refreshing/stale states, not teal. `cancel-controls.tsx`: `CancelBatchControl` (header, enabled only while cancelable jobs remain) + `CancelJobControl` (row, queued/running only), each an `alert-dialog` destructive confirm with the exact UI-SPEC copy, calling `cancelBatch`/`cancelJob` via `useTransition` + toast — immediate-cancel model A (no reconcile two-step). Plus `lib/orchestration/monitor-config.ts` (`MONITOR_POLL_MS`, env-tunable, 2s floor, 5s default).
- **Task 3 — hardened `test/orch-db-only.test.ts`** (commit `2129775`): the Wave 0 skip-if-absent vacuity branch is removed. The guard now asserts each of `app/(app)/batches/page.tsx`, `app/(app)/batches/[id]/page.tsx`, and `app/api/batches/[id]/status/route.ts` **exists** and contains none of `@/lib/runpod` / `submitRunPod` / `getRunPodStatus` / `cancelRunPod` / a bare `runpod` token — a present file importing the dispatch client now hard-fails (ORCH-02, Pattern 6).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Status route prose tripped the broadened `runpod` token guard**
- **Found during:** Task 3 (hardening the DB-only test to include the status route)
- **Issue:** Adding `app/api/batches/[id]/status/route.ts` to the assertion set surfaced its 04-05 header comment, which contained the literal "RunPod" several times in explanatory prose. The route is genuinely DB-only (imports only `prisma` + `batch-status` + `rbac`), but the `\brunpod\b/i` pattern matched the comment.
- **Fix:** Reworded the header to "the GPU dispatch client" / "GPU provider" — intent preserved, forbidden token removed (same remedy 04-05 applied to the list page).
- **Files modified:** `app/api/batches/[id]/status/route.ts`
- **Commit:** `2129775`

### Scope Decisions (within plan latitude)

- **Manual "Retry failed jobs" descoped** — the UI-SPEC marks it optional and lets it degrade to the read-only Attempt surface. The header instead offers a secondary "Rebuild from product" link on terminal-with-failures; auto-retry (Wave 2) + the Attempt column satisfy ORCH-03.

## Verification

- `test/orch-db-only.test.ts`: GREEN (3/3), now hard-asserting the two batches pages + the status route exist and import no RunPod I/O.
- Full suite: `npx vitest run` → **199/199 passing across 32 files** (incl. the hardened orch-db-only guard). The dispatch RED-path stderr lines are expected log output, not failures.
- `npx tsc --noEmit`: exit 0.
- `npx next build`: succeeds; `/batches/[id]` emitted (8.11 kB First Load 205 kB), no route collision.
- DB-only contract: the detail page + monitor read the DB / the status route only; no `runpod`/`submitRunPod`/`getRunPodStatus`/`cancelRunPod` token anywhere in the batches tree.

## Human Verification

**Status: PENDING** — Task 4 is a visual/interaction sign-off checkpoint (autonomous:false). Per the execution checkpoint guidance, all code was built and verified (tsc + next build + full vitest GREEN) and the visual check is recorded here as PENDING rather than blocking. The operator should, when convenient:
1. `npm run dev`, log in, open `/batches`, click a batch → `/batches/[id]`.
2. Confirm: aggregate bar + COMPLETED/FAILED/RUNNING/QUEUED/TOTAL stat row; jobs table (combo · status pill · attempt · duration · actions); status-filter toggle filters rows; "updated Ns ago" chip ticks and Refresh re-reads.
3. Expand a failed job → monospace render-log + Copy; expand a completed job → 160×160 thumbnail + "View in gallery".
4. Cancel batch → destructive confirm copy → cancelable jobs settle to cancelled (model A), completed stay green.
5. Confirm no purple; status carried by green/blue/amber/red/grey only; failures read calm.

## Known Stubs

- **Completed-job thumbnail** falls back to a placeholder icon when a job has no persisted `Layer` row yet — expected, since the layered-output pipeline + full gallery are Phase 5 (`OUT-01..03`). The "View in gallery" link currently targets `/batches/[id]?job=…` (a reserved self-link); Phase 5 repoints it to the Gallery surface. Documented as intentional scale-forward, not a blocking stub.

## Self-Check: PASSED

- FOUND: app/(app)/batches/[id]/page.tsx
- FOUND: app/(app)/batches/[id]/jobs-monitor.tsx
- FOUND: app/(app)/batches/[id]/error-log.tsx
- FOUND: app/(app)/batches/[id]/freshness.tsx
- FOUND: app/(app)/batches/[id]/cancel-controls.tsx
- FOUND: app/components/ui/scroll-area.tsx
- FOUND: app/components/ui/alert-dialog.tsx
- FOUND: lib/orchestration/monitor-config.ts
- FOUND commit: 86c7ac8 (Task 1)
- FOUND commit: 59f6b5b (Task 2)
- FOUND commit: 2129775 (Task 3)
