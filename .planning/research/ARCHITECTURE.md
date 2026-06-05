# Architecture Research

**Domain:** Enterprise product layer (auth + relational system-of-record + batch orchestration) over an existing Next.js 15 / Vercel / RunPod / Blender render pipeline
**Researched:** 2026-06-05
**Confidence:** HIGH (existing layers verified in-repo; status mechanisms verified against RunPod + Vercel official docs)

## Standard Architecture

This is a **subsequent milestone**: the render pipeline (Vercel API → Blob binaries → RunPod GPU → Blender recipe engine → Pillow postprocess → Blob) already exists and is reused as-is. The new work is a relational, authenticated product layer *wrapped around* that pipeline. The diagram below shows the target system; **bold-equivalent (★) boxes are NEW**, others are reused.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UI LAYER (Next.js App Router, React 19)                                  │
│  ┌───────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐  │
│  │ ★ Auth    │ │ ★ Product  │ │ ★ Batch   │ │ ★ Output │ │ Studio/Lab │  │
│  │  /login   │ │ workspace  │ │  builder  │ │ gallery+ │ │ (existing  │  │
│  │           │ │ upload/    │ │  (matrix) │ │ compositor│ │  sandbox)  │  │
│  │           │ │ inspect/   │ │           │ │ /flatten │ │            │  │
│  │           │ │ assign     │ │           │ │          │ │            │  │
│  └─────┬─────┘ └─────┬──────┘ └─────┬─────┘ └────┬─────┘ └─────┬──────┘  │
├────────┼─────────────┼──────────────┼────────────┼─────────────┼─────────┤
│  ★ MIDDLEWARE: auth gate (session check) on every non-public route       │
├────────┼─────────────┼──────────────┼────────────┼─────────────┼─────────┤
│  API ROUTE LAYER (app/api/**, runtime=nodejs, maxDuration=60)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │ ★ auth   │ │ products │ │ batches  │ │ outputs  │ │ ★ webhooks/     │ │
│  │ session  │ │ /inspect │ │ /expand  │ │/composite│ │   runpod (in)   │ │
│  │          │ │ /assign  │ │ /submit  │ │/flatten  │ │ ★ cron/reconcile│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬────────┘ │
├───────┼────────────┼────────────┼────────────┼───────────────┼──────────┤
│  SERVICE / LIBRARY LAYER (lib/, pure Node, no React)                     │
│  ┌─────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────┐ ┌────────┐ │
│  │ ★ auth/ │ │ ★ db/ Prisma │ │ ★ batch-       │ │ ★ orch/  │ │ ★ comp/│ │
│  │ rbac    │ │ client +     │ │ expansion svc  │ │ runpod   │ │ flatten│ │
│  │         │ │ repositories │ │ (matrix→jobs→  │ │ status   │ │ (server│ │
│  │         │ │              │ │  recipes)      │ │ reconcile│ │  Pillow│ │
│  │         │ │              │ │ uses existing  │ │ +retry;  │ │  or    │ │
│  │         │ │              │ │ enterprise-    │ │ wraps    │ │ canvas)│ │
│  │         │ │              │ │ recipes.ts     │ │ runpod.ts│ │        │ │
│  └────┬────┘ └──────┬───────┘ └───────┬────────┘ └────┬─────┘ └───┬────┘ │
│       │     reuses: lib/enterprise-recipes.ts, lib/runpod.ts, lib/jobs.ts │
├───────┼────────────┼─────────────────┼───────────────┼───────────┼───────┤
│  DATA LAYER (split: relational = source of record; blob = binaries)      │
│  ┌────────────────────────────────┐    ┌──────────────────────────────┐  │
│  │ ★ Postgres + Prisma (Railway)  │    │ Vercel Blob (existing)        │  │
│  │ User Role Project Product      │◄──►│ models/  outputs/<...>/       │  │
│  │ ObjectGroupAssignment Material │ url│ material-inspections/         │  │
│  │ CameraView Batch Job Output    │refs│ flattened/  (binaries only)   │  │
│  │ Layer  (system of record)      │    │                               │  │
│  └────────────────────────────────┘    └──────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  GPU WORKER (existing, unchanged): RunPod serverless → Blender →          │
│  render_scene.py → postprocess.py → upload PNG/JSON to Blob               │
│  ★ POST /run now carries a `webhook` URL for push completion              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility (owns) | Typical Implementation | New/Reused |
|-----------|----------------------|------------------------|------------|
| Auth / RBAC | Login, session issuance, role checks (Admin/Operator), route gating | JWT in HTTP-only cookie (workspace convention) + `middleware.ts` + `lib/auth/` helpers | NEW |
| Data / Prisma | Relational system of record; all structured state; transactional writes | Prisma client singleton + thin repository functions in `lib/db/` | NEW |
| Product workspace | Upload model → submit inspect → operator assigns detected objects to groups → persist assignment | API routes + Prisma writes; reuses Blob client-upload + `inspect_materials` op | NEW (orchestration), reuses inspect op |
| Batch-expansion service | Expand a batch matrix (angles × metals × per-group stones × passes) into N Job rows, each with a generated recipe | Pure function calling `buildEnterpriseRecipe()` from `lib/enterprise-recipes.ts` per combination | NEW wrapper, reuses generator |
| Orchestration / status | Submit jobs to RunPod, reconcile status, retry ≤2, surface failures | `lib/orch/` wrapping `submitRunPod`/`getRunPodStatus` + webhook handler + cron | NEW, reuses `lib/runpod.ts` |
| Outputs / compositing | Record per-pass layer outputs; stack/preview in browser; server-side flatten to a catalog deliverable | Layer rows pointing at Blob URLs; client canvas preview; server flatten endpoint | NEW |
| Studio/Lab (existing) | Paste-recipe sandbox, rating sweeps | Unchanged; now sits behind auth gate | Reused |
| GPU worker | Render execution, postprocess, upload binaries to Blob | Unchanged Python worker | Reused |

## Recommended Project Structure

Extends the existing top-level `app/` + `lib/` layout (do NOT introduce the empty `apps/` scaffold). New folders marked ★.

```
prisma/                          ★ schema.prisma + migrations + seed.ts
app/
├── (auth)/login/page.tsx        ★ login surface
├── products/                    ★ product workspace UI (list, [id] upload/inspect/assign)
│   └── [id]/page.tsx
├── batches/                     ★ batch builder + batch detail/status UI
│   └── [id]/page.tsx
├── gallery/                     ★ outputs gallery + in-browser layer compositor
│   └── [batchId]/page.tsx
├── enterprise-app.tsx           (existing — fold into products/batches flow)
├── studio.tsx, lab/, rater/     (existing — now behind auth)
├── middleware.ts                ★ session gate on all non-public routes
└── api/
    ├── auth/                    ★ login / logout / session route handlers
    ├── products/               ★ CRUD + /[id]/inspect + /[id]/assign
    ├── batches/                ★ POST create+expand+submit, GET status
    │   └── [id]/route.ts
    ├── outputs/                ★ GET layers, POST /flatten (server compositing)
    ├── webhooks/runpod/route.ts ★ INCOMING RunPod completion callback (public+signed)
    ├── cron/reconcile/route.ts  ★ Vercel Cron: sweep non-terminal jobs (safety net)
    ├── render-jobs/            (existing — keep for Studio/sandbox)
    ├── material-inspections/   (existing — reused by products workspace)
    └── blob/upload/, config/   (existing)
lib/
├── auth/                        ★ jwt.ts, session.ts, rbac.ts (requireRole)
├── db/                          ★ prisma.ts (singleton) + repositories (products, batches, jobs, outputs)
├── batch/expand.ts              ★ matrix → Job[] + recipe[] via enterprise-recipes.ts
├── orch/                        ★ submit.ts (RunPod submit + persist), reconcile.ts (status→DB), retry.ts
├── compositing/flatten.ts       ★ server-side layer flatten (sharp or worker op)
├── enterprise-recipes.ts        (existing — reused unchanged by batch/expand.ts)
├── runpod.ts                    (existing — reused by lib/orch)
├── jobs.ts                      (existing — keep for sandbox; new jobs go through Prisma)
└── types.ts                     (existing — extend, or migrate to Prisma-generated types)
workers/runpod-blender/          (existing — unchanged; /run payload gains `webhook`)
```

### Structure Rationale

- **`prisma/` at root:** Standard Prisma convention; single schema is the source of record. Seed script encodes the rendering team's real defaults (4 views, 3 metals, groups, quality presets) so Admins start with correct values.
- **`lib/db/` repositories, not raw Prisma in routes:** Keeps API routes thin and testable; centralizes transactional batch-expansion writes (a batch + N jobs created atomically).
- **`lib/orch/` separate from `lib/runpod.ts`:** `runpod.ts` stays a dumb HTTP client; orchestration (persist, retry, reconcile, status mapping to DB enums) is its own concern so the 60s-bounded submit path and the webhook/cron status path share one mapping.
- **`lib/batch/expand.ts` wraps, does not replace, `enterprise-recipes.ts`:** The deterministic generator is proven; the new service only iterates the matrix and persists rows. Reuse over rebuild (per PROJECT.md key decision).
- **Co-locate UI by domain noun** (products / batches / gallery): matches the operator's mental model (a product → a batch → outputs).

## Architectural Patterns

### Pattern 1: Split-store (relational system of record + object store for binaries)

**What:** Postgres/Prisma owns all *structured, queryable, relational* state (who, what, status, history, relationships). Vercel Blob owns *binaries only* (models, rendered PNG/JPEG layers, flattened deliverables, inspection JSON). DB rows hold Blob **URLs**, never blobs.
**When to use:** Whenever enterprise needs durable relational data + history but already has a working object store and an external GPU worker that writes binaries.
**Trade-offs:** Two stores to keep consistent (a Blob upload + a DB row); mitigated because the worker writes binaries and the *web layer* writes the authoritative DB row on the webhook/reconcile event. Replaces the current race-prone "list all Blob JSON" job store.

**Example:**
```typescript
// Output row references Blob, never stores bytes
await prisma.layer.create({ data: {
  jobId, pass: "metal", format: "jpeg",
  url: result.image_url,            // points into Vercel Blob
  meta: result.metadata_url
}});
```

### Pattern 2: Async-submit + push-status (webhook) with cron reconciliation fallback

**What:** Vercel functions cannot wait on a multi-minute render (60s cap). So: the submit route *fires and returns* (persists Job=`submitted`, POSTs to RunPod `/run` with a `webhook` field), and status arrives **out of band**. Primary channel: RunPod POSTs the full status payload to `app/api/webhooks/runpod` on completion. Safety net: a Vercel Cron route periodically reconciles any Job still non-terminal past a threshold by calling `getRunPodStatus`.
**When to use:** Long-running external work behind a short-timeout serverless function — exactly this constraint.
**Trade-offs:** Webhook is push (fast, no polling cost) but can be missed (delivery failure, cold deploy); cron guarantees eventual consistency but adds a periodic job. Together they are both fast and reliable. See "Status-Update Mechanism" below for the decision rationale.

**Example:**
```typescript
// submit (returns immediately, well under 60s)
await submitRunPod({ ...input, webhook: `${BASE_URL}/api/webhooks/runpod` });
// webhook handler (out of band)
export async function POST(req) {
  const payload = await req.json();        // same shape as /status
  await reconcileJob(payload.id, payload); // map status, write Layer rows, maybe flatten
  return Response.json({ ok: true });      // RunPod retries x2 if non-200
}
```

### Pattern 3: Transactional batch expansion (matrix → N jobs in one write)

**What:** A Batch row plus its N expanded Job rows (one per angle×metal×stone×pass combination) are created in a single Prisma transaction, each Job carrying its generated recipe JSON. Submission to RunPod happens *after* the transaction commits, iterating Jobs.
**When to use:** When one user action fans out into many tracked units that must all exist or none.
**Trade-offs:** Large matrices (e.g. 3 metals × 4 views × 3 passes × stones = dozens) create many rows + many RunPod submits; submit loop must respect the 60s window — submit asynchronously / in chunks, or enqueue and let a cron drain the submit queue if a single batch exceeds what fits in 60s.

**Example:**
```typescript
const recipes = combos.map(c => buildEnterpriseRecipe(toRequest(batch, c))); // existing generator
await prisma.$transaction([
  prisma.batch.update({ where:{id}, data:{ status:"expanded", jobCount: recipes.length }}),
  ...recipes.map((recipe, i) => prisma.job.create({ data:{ batchId:id, recipe, status:"queued", combo: combos[i] }}))
]);
// then submit jobs (chunked / async) -> set status "submitted", store runpodJobId
```

### Pattern 4: Holdout passes as Layer rows; flatten as a derived Output

**What:** Each Job's pass (`metal` JPEG, `diamond`/`stone2`/`stone3` transparent PNG) is recorded as a `Layer`. A `flattened` deliverable is a derived Output produced by stacking the variant's layers server-side. Browser preview stacks the same layers client-side with toggles.
**When to use:** Layered/compositing output domains where consumers want both raw layers and a finished image.
**Trade-offs:** Flatten can run server-side (sharp/Pillow within 60s for image compositing — fast, no GPU) or be pushed to the worker as a new lightweight op. Prefer server-side flatten in the web layer first (simpler, no worker rebuild); move to a worker op only if image sizes/volume push past 60s.

## Data Flow

### Prisma Data Model Sketch

```
User ──< (Role via enum or join) 
  id, email, passwordHash, role: Admin|Operator, createdAt

Project (optional grouping; "internal single-tenant" so 1 default project ok)
  id, name, ownerId→User

Product
  id, projectId→Project, name, modelUrl (Blob), modelFormat,
  inspectionUrl (Blob, material inventory), status, createdAt
  └──< ObjectGroupAssignment
        id, productId→Product, group: alloycolour|diamond|stone2|stone3,
        objectTokens: String[]   (the contains-tokens feeding material_map / visibility)

— Domain seed tables (Admin-editable; seeded from Flask app values) —
Metal        id, key(white|yellow|red), label, base[4], roughness
StoneType    id, key(diamond|sapphire|ruby|emerald|...), label, materialPreset(json)
CameraView   id, key(view1..view4), label, azimuth, elevation, focalMm, fStop
QualityPreset id, key(preview|medium|high|ultra), samples, resolution

Batch  (one operator "build" action)
  id, productId→Product, createdById→User, status: draft|expanded|submitted|running|partial|complete|failed,
  matrix(json: selected views[], metals[], stoneTypes per group, passes[], quality),
  jobCount, createdAt
  └──< Job
        id, batchId→Batch, status: queued|submitted|in_queue|in_progress|completed|failed|cancelled,
        runpodJobId, recipe(json, from enterprise-recipes.ts), combo(json: metal/view/pass/stoneGroup),
        attempt(int, retry ≤2), error, outputPrefix(Blob), submittedAt, finishedAt
        └──< Layer / Output
              id, jobId→Job, pass: full|metal|diamond|stone2|stone3,
              format: png|jpeg, url(Blob), metadataUrl(Blob), isFlattened(bool)
```

Notes: `Metal`/`StoneType`/`CameraView`/`QualityPreset` are kept as **tables (not enums)** precisely because PROJECT.md requires they remain **Admin-editable**. `Job.recipe` is stored as JSON (the generator's output) so the worker contract is unchanged. `ObjectGroupAssignment.objectTokens` feeds the existing `groupTokens` parameter of `buildEnterpriseRecipe()`.

### Request Flow — build a batch

```
Operator (batch builder UI)
   ↓ POST /api/batches  { productId, matrix }
[route] requireRole(Operator) → lib/batch/expand.ts
   ↓ for each combo → buildEnterpriseRecipe()  (existing generator)
   ↓ prisma.$transaction: Batch + N Job rows
[route] → lib/orch/submit.ts: submitRunPod({...recipe, webhook})  (chunked, <60s)
   ↓ persist runpodJobId, status=submitted
[response] 202 + batchId  (UI then subscribes/polls batch status)
```

### Status Flow — completion (out of band)

```
RunPod worker finishes → POST /api/webhooks/runpod {id, status, output}
   ↓ verify signature → lib/orch/reconcile.ts
   ↓ map status → Job.status; create Layer rows from output URLs
   ↓ if all batch jobs terminal → maybe trigger flatten; set Batch.status
[fallback] Vercel Cron /api/cron/reconcile (every N min):
   ↓ find Jobs non-terminal && stale → getRunPodStatus() → same reconcile path
   ↓ also drives retry: failed && attempt<2 → resubmit
```

### State Management

- **Server of record:** Postgres/Prisma (replaces public-Blob job JSON for structured data).
- **Binaries:** Vercel Blob (unchanged).
- **Client:** React component state; batch detail page polls `GET /api/batches/[id]` (cheap DB read, no RunPod call) — RunPod is only contacted by the webhook handler and the cron reconciler, never on user page loads.

## Status-Update Mechanism (Vercel 60s constraint) — DECISION

**Chosen: RunPod webhook as primary + Vercel Cron reconciliation as fallback. Drop per-GET RunPod polling for structured jobs.**

Three options were evaluated against the hard 60s function cap:

| Option | How | Fit vs 60s | Verdict |
|--------|-----|-----------|---------|
| Per-request polling (current) | Each `GET /api/render-jobs` calls `getRunPodStatus` for every in-flight job | Works but couples user page loads to RunPod latency; N jobs × HTTP per load; no completion if nobody is looking | Keep only for Studio sandbox |
| **RunPod webhook** | `/run` payload carries `webhook` URL; RunPod POSTs full status payload on completion, retries x2 on non-200 | Webhook handler does a quick DB write, finishes in ms — never approaches 60s. Push = no wasted polling | **Primary** |
| Vercel Cron reconciliation | Scheduled route sweeps non-terminal jobs, calls `getRunPodStatus`, updates DB, drives retries | Cron shares the 60s cap, so it must process a bounded batch per run; ideal as a periodic safety net, not the only channel | **Fallback + retry driver** |

**Rationale:** The webhook makes completion event-driven and removes RunPod calls from the user request path entirely (page loads become pure DB reads). But webhooks can be lost (delivery failure, redeploy, signature mismatch), so a Cron reconciler guarantees eventual consistency and is the natural home for the **retry ≤2** policy and detecting silently-stuck jobs. Neither path risks the 60s cap: the webhook handler is a fast DB write; the cron processes a bounded page of stale jobs per invocation. (RunPod webhook + payload shape: HIGH confidence, official docs. Vercel Cron shares the 60s/standard-runtime function limit: HIGH confidence, official docs.)

**Implementation notes:** Sign/secret the webhook route (it must be public to reach RunPod, so verify a shared secret/HMAC and reject otherwise). Make reconcile **idempotent** (webhook and cron may both process the same job). Vercel Cron at sub-daily frequency is a Pro-plan feature — confirm plan; if unavailable, an external scheduler (or a "kick on page load if stale" check) can call the same reconcile route.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| Internal team (current target, <~20 users, dozens of jobs/batch) | Monolith Next.js + single Postgres + single RunPod endpoint is entirely sufficient. Webhook + low-frequency cron. |
| Heavier batch volume (hundreds of jobs/batch) | Submit loop won't fit in one 60s function: move submission to a queue drained by cron (or chunked async submits). Add DB indexes on `Job(status, batchId)`. |
| Many concurrent batches / larger team | Consider a durable queue (e.g. a `JobQueue` table or external queue) and a dedicated worker route; paginate gallery; cache flattened deliverables. |

### Scaling Priorities
1. **First bottleneck:** the synchronous submit loop inside a single 60s request when a batch fans out wide → chunk submits or queue-and-cron-drain.
2. **Second bottleneck:** gallery listing large batches → DB pagination + don't re-fetch Blob on list (store dimensions/thumbnail URL on Layer).

## Anti-Patterns

### Anti-Pattern 1: Keeping job state in Blob JSON for the enterprise layer
**What people do:** Continue using `list({prefix:"app-state/render-jobs/"})` as the job DB.
**Why it's wrong:** No transactions, race conditions on concurrent updates, O(N) listing, no relational queries for batches/products/roles — the exact gaps this milestone exists to close (see CONCERNS).
**Do this instead:** Postgres/Prisma as system of record; Blob for binaries only. Keep Blob-JSON path only for the legacy Studio sandbox.

### Anti-Pattern 2: Polling RunPod on every user page load
**What people do:** Refresh RunPod status inside `GET` handlers the UI calls repeatedly.
**Why it's wrong:** Couples UX latency to RunPod, multiplies API calls, and stops updating when no one is watching — and risks the 60s cap on wide batches.
**Do this instead:** Webhook-driven updates + cron reconciliation write status to DB; user GETs read the DB only.

### Anti-Pattern 3: Rebuilding the recipe generator or worker for the new flow
**What people do:** Write a parallel recipe builder inside the batch service.
**Why it's wrong:** Duplicates proven, hand-tuned logic in `lib/enterprise-recipes.ts`; diverges from the worker's recipe contract.
**Do this instead:** `lib/batch/expand.ts` calls `buildEnterpriseRecipe()` per combo; worker payload is unchanged except the added `webhook` field.

### Anti-Pattern 4: Doing the flatten/composite on the GPU worker by default
**What people do:** Add a heavy compositing op to Blender/RunPod.
**Why it's wrong:** Layer flattening is 2D image compositing — no GPU needed; a worker round-trip adds latency and cost.
**Do this instead:** Flatten server-side (sharp/Pillow) within the 60s window; only move to a worker op if volume/size demands it.

## Integration Points

### External Services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| RunPod Serverless | `submitRunPod` POST `/run` with new `webhook` field; completion via inbound webhook; `getRunPodStatus` only from cron reconcile | Reuse `lib/runpod.ts`; rotate the previously-exposed API key |
| Vercel Blob | Binaries only; client-upload token flow for models (existing); worker writes outputs (existing) | DB stores URLs, not bytes |
| Postgres (Railway) | Prisma client singleton; migrations in `prisma/`; seed real domain defaults | New system of record |
| Vercel Cron | Scheduled `GET /api/cron/reconcile`, secret-guarded | Shares 60s cap; bounded work per run; verify plan supports needed frequency |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| middleware ↔ all routes | Session cookie check before handler | Single gate; public exceptions: `/login`, `/api/auth/*`, `/api/webhooks/runpod` (secret-verified) |
| API routes ↔ services | Direct function calls into `lib/*` | Routes stay thin (parse, authorize, delegate) |
| batch service ↔ recipe generator | Direct call to `buildEnterpriseRecipe()` | Reuse, no fork |
| orch ↔ RunPod client | `lib/orch` wraps `lib/runpod.ts` | Status-enum mapping lives in orch, shared by webhook + cron |
| DB ↔ Blob | DB rows hold Blob URLs | Worker writes binary; web writes authoritative row |

## Suggested Build Order (with dependencies)

Ordered so each step unblocks the next; early steps de-risk the data model that everything else depends on.

1. **Prisma foundation + seed** — schema (all entities above), migrations, `lib/db/prisma.ts`, seed real domain defaults. *Depends on: nothing. Unblocks: everything.*
2. **Auth + RBAC + middleware** — login/session (JWT cookie), `requireRole`, gate all routes. *Depends on: User/Role from step 1. Unblocks: any authenticated UI; removes public access (a stated requirement).*
3. **Product workspace** — upload → inspect (reuse existing op) → assign object groups → persist `Product` + `ObjectGroupAssignment`. *Depends on: 1,2 + existing inspect op + Blob upload. Unblocks: batch builder (needs group tokens).*
4. **Batch expansion service** — `lib/batch/expand.ts` matrix → Job rows via `enterprise-recipes.ts`, transactional. *Depends on: 1,3. Unblocks: orchestration.*
5. **Orchestration + status (webhook-first, cron fallback, retry)** — submit with `webhook`, inbound `webhooks/runpod`, `cron/reconcile`, retry ≤2. *Depends on: 4 + existing `runpod.ts`/worker. Unblocks: real outputs.*
6. **Outputs gallery + Layer records** — browse by product/metal/angle/pass; download layers. *Depends on: 5 (Layer rows written by reconcile).*
7. **Compositing: in-browser preview + server-side flatten** — toggle/stack layers client-side; `outputs/flatten` produces the catalog deliverable. *Depends on: 6.*
8. **Cleanup/cutover** — remove hardcoded ring99 URL + local fallback recipe path; migrate Studio behind auth; (optionally) retire Blob-JSON job store for the enterprise path. *Depends on: 2,5.*

Dependency spine: **1 → 2 → 3 → 4 → 5 → {6 → 7}**, with 8 a cross-cutting cleanup gated by 2 and 5.

## Sources

- Existing codebase (HIGH): `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `INTEGRATIONS.md`; `lib/enterprise-recipes.ts`, `lib/runpod.ts`, `lib/jobs.ts`
- Project intent (HIGH): `.planning/PROJECT.md` (constraints, key decisions, Flask-app seed values)
- RunPod serverless webhook completion callback + payload shape (HIGH): https://docs.runpod.io/serverless/endpoints/send-requests
- Vercel Cron jobs share the 60s standard-runtime function limit; App Router `maxDuration` config (HIGH): https://vercel.com/docs/cron-jobs , https://vercel.com/docs/functions/configuring-functions/duration

---
*Architecture research for: enterprise product layer over Next.js/Vercel/RunPod/Blender render pipeline*
*Researched: 2026-06-05*
