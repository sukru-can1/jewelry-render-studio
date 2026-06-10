# DATA-05 Decision: No Live-Data Migration (Met-by-Rationale)

**Requirement:** DATA-05 — *Existing render history from the prior Blob job-state is
preserved or migrated into the new store (no silent loss of past work).*

**Phase:** 08 (Cutover & Deploy)
**Date:** 2026-06-10
**Disposition:** **Complete — met-by-rationale (no migration).**

---

## Decision

There is **no live-data migration**, and DATA-05 is satisfied by rationale: there is
no production catalog history to migrate, so there is no silent loss of past work.

## Rationale

1. **The prior job history is disposable R&D, not catalog work.**
   The legacy Blob job-state (`app-state/render-jobs/*.json`, written by the now-deleted
   `lib/jobs.ts`) existed solely to drive the legacy single-purpose render surfaces
   (`enterprise-app.tsx`, `studio.tsx`, `lab`, `rater`). Their only job was iterating on
   the **single `ring99` test model**. None of it is delivered catalog imagery for a real
   product in the enterprise workflow.

2. **The store it lived in is rotated away and inaccessible.**
   That history lived in an **old, public Vercel Blob store** whose access token was
   **rotated** as part of the Phase-1 security hardening (SEC-01). The original public
   base URL (`u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com`) is no longer reachable
   with current credentials. There is nothing live to read back from.

3. **The enterprise product is clean-slate.**
   The new product layer persists all structured state in **Postgres via Prisma**
   (DATA-01: users, projects, products, object-group assignments, batches, jobs, outputs)
   and stores binary assets in a **private** Blob namespace (`renders/<batchId>/…`,
   `models/…`) via the auth-gated `/api/file` proxy (SEC-02). It started empty and
   accumulates only enterprise-workflow work. No legacy record maps onto a Postgres
   `Batch`/`Job` row.

4. **The human-authored studio settings are already captured.**
   The render-team's encoded settings from `ring99.blend` are already represented in
   `DEFAULT_RECIPE` (`workers/runpod-blender/render_scene.py:15`) and the declarative
   recipe system (`lib/enterprise-recipes.ts`). Removing the ring99 hardcodes (SEC-05)
   loses no domain knowledge — the recipe engine retains it.

**Therefore:** preserving the legacy Blob job-state would preserve scratch R&D for one
test model from an inaccessible store — not "past work" in the DATA-05 sense. There is no
production catalog history at risk, so retiring it is not silent loss.

## Future path (NOT built now)

If real render history ever needs importing later, the path would be an **idempotent,
cursor-paginated backfill** that reads the source job blobs and writes them into a
dedicated **legacy-import container `Batch`** (with synthetic but FK-valid `Job` rows),
keyed so re-runs are no-ops. This is explicitly **out of scope** for this milestone and
is not implemented — there is currently no source data to import.

## Outcome

DATA-05 marked **Complete (met-by-rationale)** in `REQUIREMENTS.md` with a one-line note:
clean-slate enterprise Postgres; legacy ring99 job-state was disposable R&D in a
rotated/inaccessible public Blob store; no catalog work to migrate, no silent loss.
