---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 09-02-PLAN.md (vision scorer + ANALYZING orchestration sweep, INTEL-02/04)
last_updated: "2026-06-11T07:59:59.212Z"
last_activity: 2026-06-11
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 34
  completed_plans: 34
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-05)

**Core value:** An operator can take one jewelry model and reliably produce the full set of catalog images — every angle × metal × stone variant, in correctly separated metal/stone layers — without touching Blender or hand-editing recipes.
**Current focus:** Phase 09 — adaptive-render-intelligence

## Current Position

Phase: 09 (adaptive-render-intelligence) — EXECUTING
Plan: 4 of 4 (09-03 + 09-04 are Wave 2, both unblocked)
Status: Phase complete — ready for verification
Last activity: 2026-06-11

Progress: [██████████] 100%

### Phase 8 execution notes

- SEC-05: deleted the legacy render cluster ENTIRELY (enterprise-app, studio, lab, rater + default-recipe.json + styles.css + the legacy API routes rating-sweeps/render-jobs/[id]/material-inspections/config + lib/jobs.ts). All verified unused by the enterprise app/(app)/ product before deletion. tsc/tests/build green; ring99/public-blob-URL/local-FS hardcodes gone from live source (only benign test fixtures remain).
- lib/types.ts was left in place (NOT in deletion scope; now an unused orphan — harmless, tsc green).
- DATA-05: NO migration — legacy job history was disposable ring99 R&D in a rotated/inaccessible public Blob store; clean-slate Postgres product. Met-by-rationale (phases/08-cutover-deploy/DATA-05-DECISION.md).
- DEPLOY-01: production `/` → 307 → /login (200); all 9 required env vars present in Vercel Production (verified via `vercel env ls production`, names/presence only).

### Phase 6 execution notes (for the executor)

- **Persistence is BLOB-ONLY.** Deliverables write to `renders/<batchId>/deliverables/<angle>_<metal>.png` via `putPrivate(allowOverwrite:true)`. Do NOT create a `Layer` row for deliverables — `Layer.jobId` is `@unique` AND a required FK to `Job.id`, so a synthetic jobId is infeasible. The 06-01 Task-1 checkpoint already defaults to blob-only; treat that as authoritative over any residual `isFlattened` wording.
- Discovery (06-02 count, 06-03 zip) is by `list({prefix:'renders/<batchId>/deliverables/'})`, never `Layer.isFlattened`.
- Wave order: 06-01 (server flatten core + RED tests) → then 06-02 (compositing UI) + 06-03 (downloads).
- sharp@0.34.5 + archiver@^8 already installed; no new deps.

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: — min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01-01 | 7 | 3 tasks | 10 files |
| Phase 01 P01-01b | 16min | 1 tasks | 24 files |
| Phase 01 P01-02 | 11 | 3 tasks | 6 files |
| Phase 01 P01-03 | 25 | 3 tasks | 12 files |
| Phase 01 P04 | 13 | 3 tasks | 5 files |
| Phase 01 P01-05 | 25 | 3 tasks | 11 files |
| Phase 02 P02-01 | 38 | 3 tasks | 13 files |
| Phase 02 P02 | 50min | 2 tasks | 6 files |
| Phase 02 P02-05 | 23min | 2 tasks | 6 files |
| Phase 02 P02-03 | 23min | 2 tasks | 7 files |
| Phase 02 P02-04 | 42 | 3 tasks | 12 files |
| Phase 03 P03-01 | 24 | 3 tasks | 6 files |
| Phase 03 P03-02 | 30m | 2 tasks | 5 files |
| Phase 03 P03-03 | 25 min | 3 tasks | 9 files |
| Phase 04 P04-01 | 25m | 4 tasks | 13 files |
| Phase 04 P04 | 5 | 2 tasks | 3 files |
| Phase 04 P04-03 | 100m | 2 tasks | 3 files |
| Phase 04 P04-05 | 25m | 3 tasks | 5 files |
| Phase 05 P05-02 | 14min | 2 tasks | 6 files |
| Phase 05 P05-04 | 30min | 3 tasks | 12 files |
| Phase 06 P06-01 | 10min | 3 tasks | 13 files |
| Phase 06 P02 | 12 | 2 tasks | 7 files |
| Phase 06 P03 | 13m | 2 tasks | 5 files |
| Phase 07 P07-01 | 7min | 2 tasks | 5 files |
| Phase 08 P08-01 | 40min | 4 tasks | 16 files |
| Phase 09 P01 | 47m | 4 tasks | 13 files |
| Phase 09 P02 | 37m | 3 tasks | 15 files |
| Phase 09 P04 | 85min | 3 tasks | 17 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Reuse the proven RunPod + Blender + `lib/enterprise-recipes.ts` + `lib/runpod.ts` pipeline; build only the product layer (auth, Postgres, builder, orchestration, outputs, compositing).
- Phase 1: Security pre-work (rotate leaked RunPod key), pooled Prisma topology (`connection_limit=1` + singleton + `directUrl`), and the `JobStatus` enum are day-one decisions — expensive to retrofit.
- Phase 3: Batch cost guardrails (live count/estimate, hard cap, preview-quality default, confirmation) MUST ship with the builder, not after.
- Phase 4: Status via RunPod webhook (primary) + Vercel Cron reconcile (fallback + retry driver); never poll RunPod on user page loads.
- [Phase ?]: Phase 1: Pinned Prisma & @prisma/client to exact 6.19.2 and next-auth to 5.0.0-beta.31 (never @latest).
- [Phase ?]: Phase 1: Added opposite-side Prisma relation fields the RESEARCH schema sketch omitted so prisma validate passes.
- [Phase 01]: Phase 1 (01-01b): geist package for Geist Sans/Mono; shadcn aliases re-pointed to app/components/ui; legacy styles.css scoped to enterprise-app.tsx so layout.tsx keeps one global stylesheet (globals.css) with the UI-SPEC teal token layer.
- [Phase ?]: Phase 1 (01-02): Applied init migration to live Railway Postgres; DATA-03 seeded with exact values (metal hex white #C4C4C4 / yellow #FFC356 / red #E09973, all presets 1920x1920); env-driven first Admin; pool healthy under 25-way concurrency.
- [Phase ?]: Phase 1 (01-03): Split Auth.js v5 (beta.31) edge-safe auth.config.ts + Node auth.ts (Credentials authorize: prisma.findUnique + bcrypt.compare + disabled guard); requireRole() is the fail-closed RBAC boundary; deny-by-default middleware allowlists only /api/auth, /login, static, /api/webhooks/runpod; webhook gated by crypto.timingSafeEqual.
- [Phase ?]: Phase 1 (01-03): Vitest needs resolve.alias next/server -> next/server.js + server.deps.inline next-auth/@auth/core to import the Node NextAuth instance; harness-only, runtime edge-safety unaffected.
- [Phase ?]: Private-blob via auth-gated /api/file proxy using get with access private; no time-limited URLs (SEC-02)
- [Phase ?]: Blob upload-token route locked behind requireSession in onBeforeGenerateToken; unauth POST = 401 with no token minted (SEC-02)
- [Phase ?]: RunPod/Blob secret rotation recorded PENDING operator attestation in docs/SECRET_ROTATION.md; no secret literal in tracked source (SEC-01)
- [Phase ?]: Phase 1 (01-05): Root app/page.tsx is now a thin auth-state redirect (no EnterpriseApp); authenticated landing at app/(app)/products/page.tsx so / no longer collides; login uses signIn(redirect:false) in a server action with generic error (no enumeration); sidebar ADMIN gating is UI-only (server requireRole authoritative in Plan 06).
- [Phase ?]: Phase 2 (02-01): Dedicated Inspection model migrated to live DB; StoneType seeded (10 rows) idempotently; upload tokens access:private + workerModelUrl signed-GET URL via issueSignedToken+presignUrl, no public fallback (SEC-02).
- [Phase ?]: 02-02: createProduct returns { ok, id } instead of server-side redirect (unit-testable); client form router.pushes
- [Phase ?]: 02-02: store blob pathname into Product.modelUrl (never the url); private delivery via /api/file proxy (T-02-06)
- [Phase ?]: 02-05: settings save action is the AUTH-05 boundary (requireRole Admin first line); page redirect is convenience only
- [Phase ?]: 02-05: StoneType editable list = deleteMany notIn(present keys) + per-row upsert in one transaction
- [Phase ?]: 02-03: inspect dispatch uses an app-minted worker job_id (sidecar key) DISTINCT from the persisted RunPod job id (poll key); inventory sidecar read privately by pathname via get(access:private), never inventory_url (SEC-02); inspection polled on-demand (interval+focus, no webhook); Groups tab is a 02-04 placeholder
- [Phase ?]: 02-04: ObjectGroupAssignment saved one-row-per-non-empty-group (delete-and-recreate transaction); objectTokens are signatures = Phase-3 holdout contains shape (PROD-04, persist-only)
- [Phase ?]: 02-04 ASSUMPTION (RESEARCH Open Q4): ready = alloycolour>=1 AND no clearly-stone mesh unassigned; Phase 3 MUST revisit when consuming token shape for holdout
- [Phase ?]: 03-02 createBatch re-enforces HARD_CAP server-side; Batch+N Jobs in one all-or-none transaction status queued; no RunPod in Phase 3
- [Phase ?]: Batch builder consumes single-source BATCH_LIMITS/countJobs/estimate/zone; no redefined thresholds in components
- [Phase ?]: Builder page branch/selector shape lives in pure lib/batches/builder-data.ts for harness-style unit testing of the no-assignment guard
- [Phase ?]: 04-03: reconcile cron reuses applyWebhookResult to replay polls (mapping+terminal guard cannot drift from webhook); sweepStrandedJobs (W-1) releases non-terminal NULL-runpodJobId jobs older than 2min to queued; retryFailedJobs re-queues status:failed attempt<RETRY_CAP(2) idempotently (runpodJobId/error null), cancelled batches excluded via cancelRequestedAt null, completed never re-queued (Pattern 4)
- [Phase 06]: 06-01 (COMP-02): deliverable persistence is BLOB-ONLY (renders/<batchId>/deliverables/<angle>_<metal>.png via putPrivate allowOverwrite) — NO Layer row (Layer.jobId @unique + required FK to Job.id makes a synthetic deliverable jobId infeasible); discovery by list({prefix}), never Layer.isFlattened.
- [Phase 06]: 06-01: compositing variant key = (angleKey × metalKey) in a new PURE groupVariantsForCompositing (NOT group.ts variant mode which ignores angle); base = metal pass, overlays = stone passes z-ordered by (sortOrder ?? Infinity, stoneGroup); validateVariant gate WARNs (200 {ok:false,warnings}) and writes nothing — never a silent flatten; flatten.ts is the sole sharp importer; route reads layer bytes privately via get(access:private)→Buffer.
- [Phase ?]: 06-02: compositing page is a DB-only Server Component (requireSession first, IDOR by params.id, force-dynamic, Node) under the orch-db-only hard guard + comp-page-db-only; every preview img src via privateUrl -> /api/file.
- [Phase ?]: 06-02 (COMP-01): compositing flattened count is BLOB-DERIVED via list by deliverable prefix matched to enumerated variant pathnames; Layer.isFlattened stays all-false under blob-only persistence and is never read.
- [Phase 07]: 07-01 (UI-01): audit-driven coherence sweep, NOT a redesign (app was 27/30). 12 raw amber-/sky-/emerald- status-palette classes → semantic warning/info/success tokens (intent-mapped) across estimate-panel + batch-builder + group-assignment; stone-group chip class map de-duped into one shared lib/groups/chip.ts (outline-style, distinct from gallery's filled GROUP_CHIP); guard test asserts no raw palette survives. UI-02 confirmed already satisfied by audit (no state-fill work).
- [Phase ?]: 09-01: cardDarkness = direct multiplier on card RGB; identity 1.0 via knob ABSENCE; explicit overrides clamp to [0,0.5] (always darker). 09-02 vision prompt must use NEGATIVE cardDarknessDelta = darker (research convention, not AI-SPEC 5.3 sign table).
- [Phase ?]: 09-01: G5 extended — milky zeroes BOTH positive exposureDelta AND positive worldStrengthDelta; when guardrails zero EVERY delta decideLoop freezes best instead of a no-op autoCorrect re-render.
- [Phase ?]: 09-01: Batch.optimizeWithAi Boolean default(false) column landed in the add_job_intel migration (applied to Railway) alongside Job.intelState/intel; createBatchSchema carries the optional default-false field, unconsumed until 09-02.
- [Phase 09]: 09-02: Job.intel.request persists the serializable buildEnterpriseRecipe context (groupTokens/stoneMaterials/productName + preview AND final quality tiers) at createBatch seed time — the sweep rebuilds recipes via the generator only, never re-deriving product state (G10).
- [Phase 09]: 09-02: the loop's FINAL render is a CLASSIC job (intelState null, no intel) so its Layer feeds the existing gallery/compositing unchanged; the trace + finalJobId link live on the analyzed job (FINAL_QUEUED). 09-03 must handle per-combo layer duplication (seed preview Layer + final Layer) in the UI.
- [Phase 09]: 09-02: ADAPTIVE_INTELLIGENCE_ENABLED lives in the typed env schema (optional; "false" disables) — not raw process.env; Batch.optimizeWithAi stores the kill-switch-RESOLVED opt-in. Sweep claim is gated on batch.optimizeWithAi=true + cancelRequestedAt null.
- [Phase 09]: 09-02: G8 enforced orthogonally to decideLoop — visionCalls>=2 pre-analysis check AND previewRenders>=2 autoCorrect demotion, both freeze-best->FINAL with cost_cap; vision attempts counted BEFORE the call so failures consume budget; analyzePreview throw => ESCALATED (verdict_invalid), never retried unboundedly.
- [Phase 09]: 09-02: reconcile cron route now also runs sweepAnalyzingJobs (3 jobs/tick) and has maxDuration 300 (in-route + path-specific vercel.json entry) — the slow vision call lives ONLY on this cron tick, never the webhook (which only flips PREVIEW_QUEUED->ANALYZING, guarded).
- [Phase 09-04]: INTEL-06 trust gate: auto-correct requires INTEL_AUTOCORRECT_ENABLED='true' (env, human act after calibration >=0.7); recommend-only default ships classic FINALs with deltas recorded as recommended-not-applied
- [Phase 09-04]: Calibration live scoring is opt-in via --record; a present OPENAI_API_KEY never triggers vision-token spend (cached verdicts are the CI path)
- [Phase 09-04]: Calibration dataset lives at calibration/dataset.json (directive override of fixtures/labels.json); run-eval.ts kept as the 5.8 CI wrapper delegating to scripts/calibrate-intel.ts

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- SEC-01 (rotate exposed RunPod key) is a hard prerequisite — all downstream auth is moot until it ships in Phase 1.
- Cost-estimate accuracy (Phase 3) needs calibration against real RunPod billing; use a configurable per-render cost factor.
- Vercel sub-daily Cron is a Pro-plan feature (Phase 4) — confirm plan at plan time; fallback is an external scheduler or kick-on-stale-page-load.
- ~~Legacy public-Blob asset policy (re-upload private vs. accept burned) to resolve in Phase 1/8.~~ RESOLVED (Phase 8): accept burned — legacy public-Blob job history is disposable ring99 R&D in a rotated/inaccessible store; no migration (DATA-05 met-by-rationale).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-11T07:58:27.079Z
Stopped at: Completed 09-02-PLAN.md (vision scorer + ANALYZING orchestration sweep, INTEL-02/04)
Resume file: None
