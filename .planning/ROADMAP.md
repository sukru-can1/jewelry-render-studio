# Roadmap: Jewelry Render Studio — Enterprise

## Overview

This milestone wraps a new, hardened, multi-user product layer around the existing (and reused) RunPod + Blender + recipe-engine render pipeline. The journey starts by closing the foundational holes — rotating the leaked secret, locking every route behind auth, privatizing Blob, and standing up a pooled Postgres/Prisma system-of-record seeded with the rendering team's real settings. From that thin security+DB+auth base, each subsequent phase delivers an end-to-end operator capability: a product can be uploaded → inspected → grouped (Product Workspace), fanned out into a guarded render matrix (Batch Builder), executed and tracked on RunPod within the 60s constraint (Orchestration), browsed as layered outputs (Gallery), composited and flattened into catalog-ready deliverables (Compositing), polished into a coherent Vercel/Notion/RunPod-influenced design system (UI), and finally cut over off the legacy public-Blob job store and shipped to Vercel. The render engine itself is never rebuilt — only the product around it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Secure Foundation (Secrets + DB + Auth)** - Rotate the leaked key, stand up pooled Prisma/Postgres seeded with real domain settings, and gate every route behind Admin/Operator auth with private Blob (completed 2026-06-08)
- [x] **Phase 2: Product Workspace** - An operator uploads a model, inspects materials, assigns detected objects to groups, and an Admin can edit the seeded domain settings (completed 2026-06-08)
- [x] **Phase 3: Batch Builder with Cost Guardrails** - An operator builds a render matrix (angles Ã metals Ã per-group stones Ã passes) with a live count/cost estimate, hard cap, and preview-quality default (completed 2026-06-08)
- [x] **Phase 4: Orchestration & Status** - Submitted batches render on RunPod with webhook-driven status, cron reconciliation, idempotent retry, progress, and cancel (completed 2026-06-09)
- [x] **Phase 5: Outputs Gallery & Layered Passes** - Completed renders appear as layered holdout outputs (metal JPEG + per-stone transparent PNG) browsable by product/metal/angle/pass with per-layer download (completed 2026-06-09)
- [x] **Phase 6: Compositing & Deliverable** - An operator previews stacked layers in-browser and the server flattens each variant into a downloadable catalog-ready deliverable (completed 2026-06-09)
- [x] **Phase 7: UI Design System & Workflow Polish** - The operator workflows share a coherent, non-purple Vercel/Notion/RunPod-influenced design system with clear loading/empty/error/in-progress states
- [x] **Phase 8: Cutover & Deploy** - Legacy render surfaces retired entirely and ring99 hardcodes removed (SEC-05); legacy job history is disposable R&D with no migration (DATA-05 met-by-rationale); app deployed to the existing Vercel project with all env vars verified (DEPLOY-01) (completed 2026-06-10)
- [ ] **Phase 9: Adaptive Render Intelligence** - An operator can opt a batch into AI optimization: the system renders a low-sample preview, scores it on the 8-dimension catalog rubric with a gpt-5.5-pro vision judge, auto-adjusts the recipe knobs within safe clamped bounds, re-renders, and surfaces the scores + reasoning + applied deltas for human accept/reject — never looping unboundedly, never silently, never hand-building recipes

## Phase Details

### Phase 1: Secure Foundation (Secrets + DB + Auth)
**Goal**: Close every foundational security and persistence hole so all later operator work is safe by construction — rotated secrets, a pooled Postgres system-of-record seeded with real defaults, deny-by-default auth with Admin/Operator roles, and private Blob.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. The previously-exposed RunPod key is rotated; no secrets are committed and every secret is read from typed env vars (fail-fast if missing)
  2. A team member can log in with credentials, stays logged in across browser refresh (JWT in HTTP-only cookie), and can log out from any page
  3. An unauthenticated request to any app or API route is denied by default; only login and the secret-verified RunPod webhook are public, and an Operator session is rejected from Admin-only actions server-side
  4. An Admin can create, disable, and assign Admin/Operator roles to accounts
  5. Structured state persists in Railway Postgres via a pooled Prisma singleton (no pool exhaustion), seeded with the real 4 views / 3 metals / 4 groups / quality presets / 1920Ã1920 defaults; Blob outputs are private and served via an auth-gated proxy route
**Plans**: 7 plans
Plans:
- [x] 01-01-PLAN.md — Foundation scaffold: pinned deps, Prisma schema + singleton + typed env, Vitest harness (Wave 0)
- [x] 01-01b-PLAN.md — Design-token layer: shadcn/Tailwind v4 init + UI-SPEC teal tokens + Geist fonts, single reconciled globals.css (Wave 0)
- [x] 01-02-PLAN.md — DB live: [BLOCKING] migrate to Railway + exact domain seed (DATA-03) + pool-health test (Wave 1)
- [x] 01-03-PLAN.md — Auth core: split edge/Node config, Credentials login, requireRole RBAC, deny-by-default middleware, webhook secret (Wave 1)
- [x] 01-04-PLAN.md — Security hardening: lock Blob upload route, private-blob proxy (SEC-02), rotate leaked secrets (SEC-01) (Wave 2)
- [x] 01-05-PLAN.md — Login + app shell vertical slice: login page, sidebar/topbar/user-menu/logout, 403 surface (Wave 2)
- [x] 01-06-PLAN.md — Admin slice: user CRUD + role assign behind requireRole(Admin), domain-settings view (Wave 3)
**UI hint**: yes

### Phase 2: Product Workspace
**Goal**: An operator can turn a raw 3D model into a render-ready product end-to-end — upload, inspect materials, assign each detected object to a group, and reopen it later — and an Admin can edit the seeded domain settings.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PROD-01, PROD-02, PROD-03, PROD-04, PROD-05, DATA-04
**Success Criteria** (what must be TRUE):
  1. An operator can create a product and upload its 3D model (GLB/FBX/BLEND/OBJ/STL) via authenticated direct-to-Blob upload
  2. An operator can run material inspection and see detected objects, material slots, and BSDF values, then assign each object to alloycolour/diamond/stone2/stone3 and save it to the product
  3. A product's saved group assignment is what drives which objects are rendered or held out in each pass
  4. An operator can browse and reopen previously created products
  5. An Admin can view and edit domain settings (camera views, metals, stone types, quality presets) and the changes apply to new batches
**Plans**: 5 plans
Plans:
- [x] 02-01-PLAN.md — Wave 0 foundation: Inspection model + migration, StoneType seed, private upload-token fix, inventory parser + token-assist, validation schemas, workerModelUrl (Wave 0)
- [x] 02-02-PLAN.md — Product create + private model upload slice (PROD-01) (Wave 1)
- [x] 02-05-PLAN.md — Admin domain-settings edit incl. StoneType CRUD (DATA-04) (Wave 1)
- [x] 02-03-PLAN.md — Inspection dispatch + poll + inventory viewer; product detail tabs (PROD-02) (Wave 2)
- [x] 02-04-PLAN.md — Object→group assignment + products list/reopen (PROD-03/04/05) (Wave 3)
**UI hint**: yes

### Phase 3: Batch Builder with Cost Guardrails
**Goal**: An operator can build and submit a render batch for a product — selecting angles, metals, per-group stone types, and layered passes — with the cost guardrails that prevent a single click from fanning out to hundreds of GPU jobs.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: BATCH-01, BATCH-02, BATCH-03, BATCH-04, BATCH-05, BATCH-06, BATCH-07
**Success Criteria** (what must be TRUE):
  1. An operator can select multiple camera angles, multiple metals, a stone type per stone group, and which layered passes (metal-only plus each selected stone group) to produce
  2. The builder shows a live job count and cost/time estimate of the current selection before submission
  3. The builder enforces a hard cap on jobs per batch, defaults to preview quality, and requires explicit confirmation above a threshold
  4. Submitting expands the matrix into one job per (angle Ã metal Ã stone-assignment Ã pass) combination, each with a generated recipe, created transactionally (all-or-none)
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Wave 0 contracts: pure estimate/cap config + domain→recipe binding + selection zod schema + failing E2E scaffold (BATCH-03/05/06/07) (Wave 0)
- [x] 03-02-PLAN.md — Fan-out core: combo expansion + recipe-per-combo (reuse buildEnterpriseRecipe) + createBatch action (auth/IDOR/server-cap/transaction) (BATCH-04/06/07) (Wave 1)
- [x] 03-03-PLAN.md — Builder UI slice: live estimate panel + multi-select selectors + stone-type picker + confirm/cap + submit + Build-batch launch button (BATCH-01/02/03/04/05/06) (Wave 2)
**UI hint**: yes

### Phase 4: Orchestration & Status
**Goal**: A submitted batch actually renders on RunPod within the Vercel 60s constraint, with reliable status, idempotent retry, visible progress and failures, and the ability to cancel.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05
**Success Criteria** (what must be TRUE):
  1. Each job is submitted to RunPod and tracked with a status (queued / running / completed / failed / cancelled)
  2. Status updates arrive via a secret-verified RunPod webhook with a Vercel Cron reconciliation fallback — user page loads are DB-only reads, never per-request RunPod fan-out
  3. A failed job retries automatically up to ~2Ã idempotently (checks the existing RunPod request id; no duplicate successful renders)
  4. An operator can view a batch's progress (completed / failed / total), read the error/log for any failed job, and cancel a queued or running batch/job
**Plans**: 6 plans
Plans:
- [x] 04-01-PLAN.md — Wave 0: [BLOCKING] additive migration + CRON_SECRET/APP_URL env + shared status-map + 7 failing test scaffolds (Wave 0)
- [x] 04-02-PLAN.md — Chunked cron dispatcher (60s-safe) + idempotent webhook receiver (ORCH-01/02) (Wave 1)
- [x] 04-04-PLAN.md — cancelRunPod helper + cancelBatch/cancelJob Server Actions (requireSession + IDOR) (ORCH-05) (Wave 1)
- [x] 04-03-PLAN.md — Reconcile cron (webhook-missed fallback) + idempotent failed-under-cap retry (ORCH-02/03) (Wave 2)
- [x] 04-05-PLAN.md — DB-only batch-status engine + status pills + aggregate bar + Batches list + freshness route (ORCH-04) (Wave 3)
- [x] 04-06-PLAN.md — Batch detail jobs monitor + error-log + freshness poll + cancel/retry UI + DB-only-reads source gate (ORCH-04/05/03) (Wave 4)
**UI hint**: yes

### Phase 5: Outputs Gallery & Layered Passes
**Goal**: Completed renders are produced as correctly separated holdout layers and an operator can browse, preview, and download them organized the way they think about catalog output.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: OUT-01, OUT-02, OUT-03
**Success Criteria** (what must be TRUE):
  1. Completed renders are produced as layered outputs: the metal pass as JPEG and each stone group as a transparent PNG via holdout
  2. An operator can browse a batch's outputs in a gallery organized by product / metal / angle / pass, reading layer records from the DB (terminal jobs are never re-fetched from RunPod)
  3. An operator can preview any output and download an individual layer or the full set via signed URLs
**Plans**: 4 plans
Plans:
- [x] 05-01-PLAN.md — Wave 0: [BLOCKING] Layer.jobId @unique migration + 6 failing test scaffolds + archiver dependency checkpoint (Wave 0)
- [x] 05-02-PLAN.md — OUT-01: stone-pass recipe transparency (true holdout) + deriveLayerFromResult idempotent completion hook (Wave 1)
- [x] 05-03-PLAN.md — OUT-03: /api/file attachment download + auth-gated batch-scoped streaming zip route (Wave 1)
- [x] 05-04-PLAN.md — OUT-02/03: DB-only gallery Server Component + card/controls/lightbox + combo-key fix + "View in gallery" wiring (Wave 2)
**UI hint**: yes

### Phase 6: Compositing & Deliverable
**Goal**: An operator can assemble and ship catalog-ready imagery — preview stacked layers in-browser and download a server-flattened deliverable per variant or whole batch.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: COMP-01, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):
  1. An operator can stack a variant's metal + stone layers in-browser and toggle layers on/off to preview the assembled image
  2. The server flattens a variant's layers into a single correctly-aligned catalog-ready deliverable per variant, validating identical dimensions and non-trivial alpha coverage (empty/mismatched layers warn rather than silently flatten)
  3. An operator can download the flattened deliverable for a variant or a whole batch
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md — Server flatten core: PURE (angle×metal) grouping + z-order, validation gate, sharp composite + auth-gated per-variant flatten route, Wave-0 RED scaffolds, persistence decision (Wave 0) (completed 2026-06-09)
- [x] 06-02-PLAN.md — COMP-01 in-browser LayerCompositor (stacked toggle-able layers) + DB-only compositing/ page + segment switcher + per-variant flatten-and-download (Wave 1)
- [x] 06-03-PLAN.md — COMP-03 downloads: single deliverable attachment + whole-batch zip of flattened deliverables with capped lazy flatten (Wave 1)
**UI hint**: yes

### Phase 7: UI Design System & Workflow Polish
**Goal**: The operator-facing surfaces share one coherent, cutting-edge design system and every primary workflow handles its loading, empty, error, and in-progress states cleanly.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. The interface is built with the `ui-ux-pro-max` skill into a coherent design system (tokens, components) influenced by Vercel, Notion, and RunPod — functional and cutting-edge, with no purple as the primary brand color
  2. The primary operator workflows (product workspace, batch builder, job monitor, gallery/compositing) are navigable, responsive, and show clear loading/empty/error/in-progress states
**Plans**: 1 plan
Plans:
- [x] 07-01-PLAN.md — Status-token sweep (12 raw amber-/sky-/emerald- palette colors → semantic warning/info/success tokens across estimate-panel + batch-builder + group-assignment) + de-dupe stone-group chip map into one shared lib/groups/chip.ts; UI-02 confirmed already satisfied by audit (completed 2026-06-10)
**UI hint**: yes

### Phase 8: Cutover & Deploy
**Goal**: Retire the legacy public-Blob job path without losing history, remove the hardcoded references, and ship the app to the existing Vercel project with all new env vars configured.
**Mode:** mvp
**Depends on**: Phase 1, Phase 4
**Requirements**: SEC-05, DATA-05, DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. ✅ The hardcoded `ring99` model URL and the local fallback recipe path are removed from API routes — legacy surfaces deleted entirely (the only hardcode carriers); grep confirms zero live references
  2. ✅ Existing render history requires no migration — it was disposable ring99 R&D in a rotated/inaccessible public Blob store; the enterprise product is clean-slate Postgres, so there is no catalog history to migrate and no silent loss (DATA-05 met-by-rationale; see `phases/08-cutover-deploy/DATA-05-DECISION.md`)
  3. ✅ The app builds and deploys to the existing Vercel project `sukrus-projects-1b84f634/jewelry-render-studio` with the new env vars configured — verified: production `/` → 307 → `/login` (200); all 9 required env vars present in Production

### Phase 9: Adaptive Render Intelligence
**Goal**: An operator can opt a batch into AI optimization; the system renders a low-sample preview, scores it on the 8-dimension catalog rubric with a gpt-5.5-pro vision judge, auto-adjusts the recipe knobs within safe clamped bounds, re-renders, and surfaces scores + reasoning + applied knob deltas for human accept/reject — never looping unboundedly, never silently, never hand-building recipes.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04, INTEL-05, INTEL-06
**Success Criteria** (what must be TRUE):
  1. `buildEnterpriseRecipe` accepts an optional named-knob `profileOverrides` input (worldStrength, exposure, cardDarkness, contactShadowStrength, cameraPreset), clamped to KNOB_RANGES; with no overrides it is byte-identical to today (backward-compatible) and the loop NEVER hand-builds recipe JSON
  2. A gpt-5.5-pro vision judge scores a downscaled PRIVATE preview on the 8-dimension rubric via schema-validated structured output (generateObject→generateText fallback), and the loop maps its bounded relative deltas → clamped overrides → re-render
  3. The loop runs on the existing async machinery — preview/final are ordinary RunPod Jobs through the chunked cron; the completion webhook only flips state (stays fast); a cron ANALYZING sweep runs the slow vision call; every transition is an idempotent guarded updateMany recovered by the existing reconcile cron
  4. Every guardrail is enforced: schema+clamp (G1/G2), MAX_ITERATIONS=2 (G3), stop-on-no-improvement (G4), forbidden-move (G5), escalate-not-loop (G6), pass-type gate (G7), cost cap (G8), env + per-batch kill-switch (G9), single-quality-source (G10)
  5. The operator ALWAYS sees the AI's D1–D8 scores + reasoning + applied knob deltas and can accept/reject/override (logged); escalations surface why; the feature is an opt-in toggle default OFF and bypassed when OPENAI_API_KEY is absent
  6. A domain-expert-labelled reference set calibrates the judge; auto-correct stays in recommend-only mode until judge↔human agreement ≥ 0.7
**Plans**: 4 plans
Plans:
- [x] 09-01-PLAN.md — Pure foundation: profileOverrides + KNOB_RANGES in buildEnterpriseRecipe (backward-compatible) + visionVerdictSchema + decideLoop (escalate→accept→autoCorrect→freeze-best) + guardrails (G3/G4/G5/G7) + [BLOCKING] additive Job.intelState/intel migration + optimizeWithAi field (INTEL-01/03) (Wave 0)
- [x] 09-02-PLAN.md — Vision scorer (private blob → sharp downscale → generateObject/text fallback) + ANALYZING cron sweep state machine (idempotent preview→analyze→adjust→final, caps, escalate) + webhook ANALYZING flip + createBatch opt-in + reconcile-cron wire (INTEL-02/04) (Wave 1)
- [ ] 09-03-PLAN.md — UI: Optimize-with-AI batch toggle (default OFF) + per-job intel panel (scores/flags/deltas/rationale/decision + accept/reject/override + escalation) + auth-first IDOR operator-action + DB-only intel read (INTEL-05) (Wave 2)
- [ ] 09-04-PLAN.md — Calibration gate: domain-expert-labelled reference set + ±1/sign-agreement/hard-gate harness + judge↔human agreement ≥0.7 trust gate (recommend-only default) wired into decideLoop (INTEL-06) (Wave 2)
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Secure Foundation (Secrets + DB + Auth) | 7/7 | Complete   | 2026-06-08 |
| 2. Product Workspace | 5/5 | Complete   | 2026-06-08 |
| 3. Batch Builder with Cost Guardrails | 3/3 | Complete   | 2026-06-08 |
| 4. Orchestration & Status | 6/6 | Complete   | 2026-06-09 |
| 5. Outputs Gallery & Layered Passes | 4/4 | Complete   | 2026-06-09 |
| 6. Compositing & Deliverable | 3/3 | Complete   | 2026-06-09 |
| 7. UI Design System & Workflow Polish | 1/1 | Complete   | 2026-06-10 |
| 8. Cutover & Deploy | 1/1 | Complete   | 2026-06-10 |
| 9. Adaptive Render Intelligence | 2/4 | In Progress|  |
