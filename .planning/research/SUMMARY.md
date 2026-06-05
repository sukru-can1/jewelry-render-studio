# Project Research Summary

**Project:** Jewelry Render Studio - Enterprise
**Domain:** Internal multi-user batch GPU render orchestration + catalog-image production (a new auth/persistence/orchestration/compositing product layer over an existing Next.js 15 / Vercel / RunPod / Blender pipeline)
**Researched:** 2026-06-05
**Confidence:** HIGH

## Executive Summary

This is an **enterprise management surface wrapped around an already-proven render engine**. The Blender/Cycles recipe engine, the RunPod GPU worker, Vercel Blob storage, and the deterministic per-variant recipe generator (`lib/enterprise-recipes.ts`) all exist and are explicitly reused, not rebuilt. The milestone adds exactly four new dimensions on top: authentication + RBAC, a Postgres/Prisma relational system-of-record, batch job-matrix orchestration with async status, and layered holdout compositing. The tool sits at the intersection of four mature product categories - render-farm managers (Deadline), 3D product-render/configurator backends, DAM/PIM catalog tooling, and layered compositing tools - so the feature baseline is well-understood and the build is integration work, not invention.

The recommended approach follows workspace convention and the lowest-friction serverless-correct path: **Auth.js v5 (Credentials provider, encrypted JWT in an HTTP-only cookie)** for auth/RBAC, **Prisma 6 + Railway Postgres** as the durable store (explicitly *not* Prisma 7, which forces driver adapters for marginal benefit), an **async-submit + RunPod-webhook + Vercel-Cron-reconcile** pattern to live within Vercel's hard 60s function cap, and **sharp** for server-side flatten of layered passes into catalog-ready deliverables. The architecture's spine is a **split-store**: Postgres owns all structured/relational state (users, products, group assignments, batches, jobs, layers, history), Blob holds binaries only, and DB rows carry Blob URLs. The clean dependency chain is Prisma foundation -> Auth/RBAC -> Product workspace -> Batch expansion -> Orchestration -> Gallery -> Compositing.

The dominant risks are **cost and security**, both introduced by removing the human throttle that the legacy Flask tool had. The matrix UX makes "select all" a single click that can silently fan out to 1,000+ GPU jobs and hundreds of dollars - so a live job-count/cost estimate, a hard cap, a confirmation gate, and a preview-quality default are mandatory in the builder phase. Security must be handled as a cross-cutting deny-by-default gate, not per-route: the previously chat-exposed RunPod key must be **rotated as a pre-phase prerequisite**, Blob must move from public to private+signed-URLs (auth on routes is moot while recipes/outputs leak by URL), and the machine-to-machine RunPod webhook must be secret/signature-authenticated rather than session-gated. The other two recurring traps are Prisma connection-pool exhaustion on serverless (use a pooled URL + singleton + `connection_limit=1` from day one) and non-idempotent RunPod retries (check existing request id before resubmitting; cap `retryCount`; deterministic output paths).

## Key Findings

### Recommended Stack

Only the four new dimensions are in scope; the existing Next.js 15 / React 19 / Vercel Blob / RunPod-Blender stack is kept as-is. Recommendations were version-verified against current npm/changelogs as of 2026-06-05 (HIGH confidence). The through-line is "lowest migration tax, matches workspace convention, serverless-correct."

**Core technologies:**
- **Auth.js (NextAuth) v5** (`next-auth@5.0.0-beta.29`, Credentials + `@auth/prisma-adapter`, `bcryptjs`): App-Router-native `auth()` helper; with `session.strategy="jwt"` it produces exactly the encrypted-JWT-in-HTTP-only-cookie the workspace mandates. Role lives in the JWT for RBAC. Free, self-hosted - correct for a small internal single-tenant team.
- **Prisma ORM v6** (`prisma@6.19.2` + Railway Postgres 16): type-safe system of record matching the Glamira convention. v6's classic generator "just works" on Vercel with standard TCP Postgres - no driver-adapter wiring. **Avoid Prisma 7** (driver-adapters-required migration tax).
- **Vercel Cron + DB-as-queue + RunPod webhook**: jobs are DB rows; submit fires-and-returns under 60s; RunPod webhook pushes completion; a cron route reconciles stale jobs and drives retries. No extra queue infra for this milestone's matrix sizes.
- **sharp** (`sharp@0.34.5`): libvips-based server-side `composite()`/`flatten()` of the metal JPEG + transparent stone PNGs into the catalog deliverable. Far lighter than `node-canvas` on Vercel.
- **Supporting:** `zod` (validate the matrix + mutations), `@t3-oss/env-nextjs` (fail-fast typed env - directly addresses the secrets concern), `swr` (lightweight DB-status polling).

### Expected Features

The user's existing pipeline supplies the render engine; "table stakes" here means the minimum management features that make the four product categories usable by an operator.

**Must have (table stakes / v1):**
- Auth + login (no anonymous access) - foundational; everything depends on it
- Admin + Operator RBAC - separates system-config from operation
- Postgres + Prisma persistence - durable, queryable records replace race-prone Blob JSON
- Seeded, Admin-editable domain settings - real 4 views / 3 metals / 4 groups / quality presets / 1920x1920 as rows, not hardcode
- Product workspace (upload -> inspect -> assign object groups) - the entry point; reuses existing inspect op
- Batch / job-matrix builder with **live job-count preview** - the core value
- Job queue + status tracking + retry (<=2) + failure logs - operators must see and recover failures
- Layered holdout output (metal JPEG + per-stone transparent PNG) - the deliverable structure
- Outputs gallery organized by product/metal/angle/pass - browse + download

**Should have (competitive differentiators / v1.x):**
- Server-side auto-flattened catalog-ready deliverable - closes the last mile vs. a generic render farm
- In-browser layer compositing/preview (toggle layers) - operators QA assembled variants before download
- Per-group stone-type catalog (cut x size x quality) in the builder - what makes it a *jewelry* tool
- Matrix-grid batch progress view - instantly spot which cell failed

**Defer (v2+):**
- Lightweight "batch reviewed" QA flag, external DAM export, saved batch templates / re-run, notifications

**Explicit anti-features (do NOT build):** multi-tenant SaaS, rebuilding the Blender worker/recipe engine, in-browser 3D editing, a custom GPU scheduler, WebSocket live streaming, full DAM taxonomy/rights, multi-level approval chains, arbitrary per-job recipe hand-editing (the old sandbox).

### Architecture Approach

A relational, authenticated product layer wrapped around the unchanged render pipeline, organized in layers: UI (auth/products/batches/gallery) -> deny-by-default auth middleware -> thin API routes (`runtime=nodejs`, `maxDuration=60`) -> `lib/*` service layer (auth/rbac, db repositories, batch-expansion, orchestration, compositing) -> split data layer (Postgres source-of-record + Blob binaries). The render worker is reused unchanged except `/run` now carries a `webhook` URL.

**Major components:**
1. **Auth / RBAC** - login, JWT-cookie session, `requireRole`, single middleware gate (NEW)
2. **Data / Prisma** - relational system of record; `globalThis` singleton + thin repositories in `lib/db/` (NEW)
3. **Product workspace** - upload -> inspect (reused op) -> assign objects to groups -> persist (NEW orchestration)
4. **Batch-expansion service** - `lib/batch/expand.ts` wraps (does not replace) `buildEnterpriseRecipe()`; matrix -> N Job rows in one transaction (NEW wrapper, reused generator)
5. **Orchestration / status** - `lib/orch/` wraps `lib/runpod.ts`; webhook-primary + cron-fallback + retry <=2 (NEW)
6. **Outputs / compositing** - Layer rows -> Blob URLs; client canvas preview + server `sharp` flatten (NEW)

Four key patterns: split-store (relational + object store), async-submit + push-status webhook with cron reconciliation, transactional batch expansion (all-or-none Job rows), and holdout passes as Layer rows with flatten as a derived Output.

### Critical Pitfalls

1. **Combinatorial batch explosion** - one "select all" click can generate 1,000+ GPU jobs / hundreds of dollars. Avoid: live job-count + GPU-minutes + cost estimate before submit, hard per-batch cap + confirmation gate, default to preview (64 samples), enforce RunPod endpoint max-concurrency as a spend ceiling.
2. **Exposed secrets + public Blob** - the chat-leaked RunPod key must be **rotated first, before any feature work** (auth is moot otherwise). Move Blob to private + short-lived signed URLs; auth the upload-token route. Gallery/compositing must consume signed URLs from the start.
3. **Auth/RBAC retrofitted with gaps** - one missed open route (often the webhook callback or upload route) leaves a hole. Avoid: deny-by-default middleware matcher over all `/api/*`, allowlist only login + (secret-verified) webhook, single `requireRole()` helper for all mutations.
4. **Prisma connection-pool exhaustion on serverless** - `P2024` / "too many connections" under modest tab concurrency. Avoid: `globalThis` singleton, pooled URL with `connection_limit=1`, `directUrl` only for migrations. A day-one topology decision.
5. **Non-idempotent RunPod retries + 60s timeouts** - blind resubmit double-bills; N+1 status polling blows the 60s cap. Avoid: check existing RunPod request id before resubmitting, cap `retryCount`, deterministic job-id-derived output paths; split listing (DB-only) from refresh; webhooks over polling; never refresh terminal jobs.
6. **History migration loss + compositing misalignment** - naive Blob->Postgres cutover splits/truncates history (1000-item `list()` cap, mixed-case statuses); compositing assumes pixel-aligned, cleanly-masked passes. Avoid: idempotent cursor-paginated backfill with explicit enum mapping + dual-read window; validate identical dimensions + non-trivial alpha coverage per layer, warn on empty layers instead of silently flattening.

## Implications for Roadmap

The architecture research provides an explicit dependency spine: **1 -> 2 -> 3 -> 4 -> 5 -> {6 -> 7}**, with security cleanup cross-cutting. A **pre-phase** key rotation gates everything. Suggested phase structure:

### Phase 0 (Pre-phase): Secret Rotation & Hygiene
**Rationale:** The exposed RunPod key (and Blob/OIDC tokens) make all downstream auth work meaningless until rotated; this is cheap and independent of feature work.
**Delivers:** Rotated `RUNPOD_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `VERCEL_OIDC_TOKEN`; verified `.gitignore` + secret scanner; typed env via `@t3-oss/env-nextjs`.
**Avoids:** Pitfall 2 (exposed secrets).

### Phase 1: Prisma Foundation + Seed
**Rationale:** The data model is what everything else depends on; the pooled-connection topology is a day-one decision expensive to retrofit.
**Delivers:** `schema.prisma` (User/Role, Project, Product, ObjectGroupAssignment, Metal/StoneType/CameraView/QualityPreset as **tables**, Batch, Job, Layer), migrations, `lib/db/prisma.ts` singleton, seed of the rendering team's real defaults (4 views, 3 metals, 4 groups, quality presets, 1920x1920).
**Uses:** Prisma 6 + Railway Postgres, pooled `DATABASE_URL` (`connection_limit=1`) + `DIRECT_URL` for migrations.
**Avoids:** Pitfall 4 (pool exhaustion), Pitfall 6 (define `JobStatus` enum up front).

### Phase 2: Auth + RBAC + Middleware
**Rationale:** Removes public access (a stated requirement) and gates every subsequent UI; depends only on User/Role from Phase 1.
**Delivers:** Auth.js v5 Credentials login, JWT-cookie session, `requireRole()`, deny-by-default `middleware.ts` allowlisting only login + webhook routes; Blob -> private + signed URLs.
**Implements:** Auth/RBAC component. **Avoids:** Pitfalls 3 and 2 (Blob privacy).

### Phase 3: Product Workspace
**Rationale:** A batch fans out per stone group, so groups must be assignable before the builder can offer per-group choices.
**Delivers:** Upload -> inspect (reuse existing op) -> assign detected objects to alloycolour/diamond/stone2/stone3 -> persist Product + ObjectGroupAssignment.
**Addresses:** Product workspace table-stakes feature.

### Phase 4: Batch Expansion Service
**Rationale:** Core value; depends on assigned groups (Phase 3) and seeded settings (Phase 1).
**Delivers:** `lib/batch/expand.ts` - matrix (angles x metals x per-group stones x passes) -> transactional Batch + N Job rows via reused `buildEnterpriseRecipe()`; builder UI with **live count + cost estimate + hard cap + confirmation**, preview-quality default.
**Addresses:** Batch matrix builder. **Avoids:** Pitfall 1 (combinatorial explosion - guardrails must land here).

### Phase 5: Orchestration + Status (webhook-first, cron fallback, retry)
**Rationale:** Turns Job rows into real renders within the 60s constraint.
**Delivers:** Submit with `webhook` (chunked/async), inbound secret-verified `webhooks/runpod`, `cron/reconcile` safety net + retry <=2 driver, idempotent result handling, Layer rows.
**Uses:** RunPod webhook + Vercel Cron. **Avoids:** Pitfalls 5 (60s/N+1) and 3 (idempotent retries).

### Phase 6: Outputs Gallery + Layer Records
**Rationale:** Layer rows exist once Phase 5 reconcile writes them; depends on completed jobs.
**Delivers:** Gallery grouped by product/metal/angle/pass; DB-only paginated listing (never refresh terminal jobs); per-layer preview + download via signed URLs.
**Avoids:** Pitfall 5 (listing/refresh split).

### Phase 7: Compositing - In-browser Preview + Server Flatten
**Rationale:** Both require separated holdout layers (Phase 5/6); the auto-flattened deliverable is the differentiator.
**Delivers:** Client canvas/CSS layer-toggle preview + `outputs/flatten` server `sharp` deliverable, with dimension + alpha-coverage validation.
**Implements:** Compositing component. **Avoids:** Pitfall 6 (misalignment/empty-layer).

### Phase 8 (cross-cutting): Cleanup / Cutover
**Rationale:** Gated by Phases 2 and 5.
**Delivers:** Remove hardcoded ring99 URL + local fallback recipe path; move Studio sandbox behind auth; idempotent cursor-paginated Blob->Postgres history backfill with dual-read window; retire Blob-JSON job store for the enterprise path.
**Avoids:** Pitfall 6 (history migration loss).

### Phase Ordering Rationale

- **Dependency-driven:** Persistence and auth are foundational - no operator feature is safe while routes are public and state lives in race-prone Blob JSON. The architecture's `1->2->3->4->5->{6->7}` spine is followed directly.
- **Architecture-grouped:** UI domain nouns (products -> batches -> gallery) map to phases, matching the operator's mental model.
- **Pitfall-front-loaded:** Key rotation precedes everything; pool topology and the JobStatus enum are decided in Phase 1; cost guardrails are non-negotiable in the builder phase before the first real submission.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase`):
- **Phase 5 (Orchestration):** Highest-risk integration - RunPod webhook payload/signature shape, Vercel Cron plan/frequency limits, idempotency and retry-state modeling. Verify against current RunPod + Vercel docs at plan time.
- **Phase 7 (Compositing):** Holdout alpha-coverage validation, signed-URL lifecycle in canvas, and the server-flatten-vs-worker-op threshold warrant focused design.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Prisma):** Well-documented; the pooled-singleton-`directUrl` recipe is settled.
- **Phase 2 (Auth):** Auth.js v5 Credentials + JWT-cookie + middleware is a documented, conventional pattern.
- **Phase 3 / Phase 6:** Standard CRUD + gallery listing patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against current npm/changelogs as of 2026-06-05; grounded in workspace convention and official docs. |
| Features | HIGH | Grounded in established render-farm managers (Deadline), DAM/PIM tooling, and mapped directly to PROJECT.md Active requirements + existing recipe/holdout code. |
| Architecture | HIGH | Existing layers verified in-repo; status mechanism (webhook + cron) verified against RunPod + Vercel official docs. |
| Pitfalls | HIGH | Verified against Prisma/RunPod/Vercel docs and cross-referenced against the existing `.planning/codebase/CONCERNS.md` debt audit. |

**Overall confidence:** HIGH

### Gaps to Address

- **Cost-estimate accuracy:** GPU-minutes/cost per render depend on quality tier and model complexity; the builder's estimate needs a calibration pass against real RunPod billing during Phase 4. Handle with a configurable per-render cost factor, refined after first real batches.
- **Vercel plan / Cron frequency:** Sub-daily Cron is a Pro-plan feature. Confirm the plan during Phase 5 planning; fallback is an external scheduler or a "kick reconcile on stale page load" check.
- **Legacy public-Blob assets policy:** Decide whether to re-upload existing public outputs as private under new paths or accept they are burned. Resolve during Phase 2/8.
- **Batch fan-out scale:** DB-as-queue + cron is sufficient for ~60-job batches; if real batches grow to hundreds, revisit a durable queue (Inngest/QStash). Flag as a Phase 5 scaling watch-item, not a v1 build.

## Sources

### Primary (HIGH confidence)
- npm / Auth.js (authjs.dev) - `next-auth@5.0.0-beta.29`, App-Router-native, JWT-cookie session
- Prisma changelog/docs (prisma.io) - v6.19.2 stable line; v7 driver-adapter requirement; connection pooling, singleton, `directUrl`
- Railway / Neon transition docs - managed Postgres 16; Vercel Postgres discontinued -> Neon via Marketplace
- RunPod docs (docs.runpod.io) - serverless `/run` webhook completion + payload shape; endpoint max-workers/concurrency cost caps; retry semantics
- Vercel docs (vercel.com) - Cron jobs share the 60s standard-runtime function limit; `maxDuration`; Next.js 15.1 `after()`
- sharp (sharp.pixelplumbing.com) - `composite()` / `flatten()` server compositing
- AWS Thinkbox Deadline / Deadline Cloud docs - job/task model, priority, requeue, per-task logs (feature baseline)
- Existing codebase: `.planning/codebase/{ARCHITECTURE,STRUCTURE,INTEGRATIONS,STACK,CONCERNS}.md`; `lib/enterprise-recipes.ts`, `lib/runpod.ts`, `lib/jobs.ts`
- Project intent: `.planning/PROJECT.md` (constraints, key decisions, Flask-app seed values)
- Supabase Prisma troubleshooting - transaction-mode port 6543, `directUrl` for migrations

### Secondary (MEDIUM confidence)
- Industry Today / AWS VAMS - 3D product-render variant matrices, batch permutations, DAM handoff
- Sitecore / IntelligenceBank / ImageKit - DAM metadata, versioning, approval-workflow baseline
- Vercel Community - Prisma connection-pool timeout reports

### Tertiary (LOW confidence)
- None - all findings traced to primary or corroborated secondary sources.

---
*Research completed: 2026-06-05*
*Ready for roadmap: yes*
