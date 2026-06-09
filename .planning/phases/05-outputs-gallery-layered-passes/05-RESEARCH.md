# Phase 5: Outputs Gallery & Layered Passes - Research

**Researched:** 2026-06-09
**Domain:** Next.js 15 Server-Component gallery over Postgres + private-Blob delivery + layered-pass output recording
**Confidence:** HIGH (codebase-grounded; all critical claims verified against repo source)

## Summary

Phase 5 turns the already-rendering per-pass jobs into a browsable, downloadable gallery. The render pipeline is already producing one image per `(angle × metal × pass)` job (Phase 3/4); Phase 5's real work is three things: (1) **RECORD** each completed job's output as a `Layer` row (the schema and the `Job.result` JSON exist, but **nothing creates `Layer` rows today** — verified), (2) **READ** those rows in a DB-only Server Component gallery grouped/filtered by product/metal/angle/pass, and (3) **DELIVER** previews and downloads through the existing auth-gated `/api/file` proxy plus a new sibling auth-gated zip route — never public URLs.

**The riskiest finding is OUT-01.** The requirement says "metal pass as JPEG and each stone group as a transparent PNG via holdout." The existing worker does **NOT** currently satisfy this: `render_scene.py` hardcodes `file_format = "PNG"` + `color_mode = "RGBA"` for every render (lines 756-757), uploads every output as `{job_id}.png` with content-type `image/png` (`handler.py:174,178`), and `film_transparent` is driven by `render.transparent` which `enterprise-recipes.ts` sets to `false` for **all** passes (line 199). Worse, the stone pass's `buildVisibility()` *includes* the metal tokens (lines 150-156), so the stone pass renders metal+stone on an opaque background — not a transparent holdout. There are two viable resolutions; the cleanest is a **recipe-level change** (set `render.transparent: true` and exclude metal tokens for stone passes) that the existing worker already honors, plus recording the true format from metadata. A worker code change is NOT required if we accept PNG-with-alpha for the metal pass too (see OUT-01 section for the decision the planner must surface).

**Primary recommendation:** Create `Layer` rows by **extending the webhook/reconcile completion path** (a `deriveLayerFromResult` helper called inside the existing `applyWebhookResult` "completed" branch, upsert-by-unique-key for idempotency) — NOT a derive-on-read. Build the gallery as a `force-dynamic` Node-runtime Server Component reading `Layer ⋈ Job ⋈ Batch`. Route every image and download through `/api/file`; build a new `app/(app)/batches/[id]/download/route.ts` (nodejs) that streams a zip via `archiver` → `Readable.toWeb()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Record completed render as `Layer` row | API / Backend (webhook+reconcile writer) | DB | The completion event already lands in `applyWebhookResult`; Layer creation belongs there, idempotently, beside the `Job.result` write |
| Per-pass transparency / format (OUT-01) | GPU worker (Blender) + recipe builder | — | `film_transparent` + file format are render-engine concerns; driven by recipe flags the worker already reads |
| Gallery browse / group / filter | Frontend Server (SSR) | DB | DB-only read of terminal data; no client polling, no RunPod |
| Preview / single-layer download | API / Backend (`/api/file` proxy) | Browser | Auth + private-blob `get()` must be server-side next to the read (SEC-02) |
| Full-set / batch zip download | API / Backend (new zip route) | — | Server re-reads blobs and streams an archive; client never touches Blob |
| Thumbnail/preview image rendering | Browser | API proxy | `<img src>` resolves to `/api/file?pathname=…`; bytes streamed by the proxy |

## Standard Stack

### Core (all already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.1.4 | App Router Server Components, Route Handlers | Existing app framework |
| @prisma/client | 6.19.2 | `Layer ⋈ Job ⋈ Batch` reads + Layer upsert | Existing data layer (DATA-01) |
| @vercel/blob | ^2.4.0 | `get(pathname,{access:'private'})` proxy + zip route source reads | Existing private-blob store (SEC-02) |
| next-auth | 5.0.0-beta.31 | `requireSession()` on every read/download | Existing auth boundary |
| lucide-react | ^0.468.0 | Gallery/lightbox/download glyphs | Inherited icon set |
| sonner | ^2.0.7 | Download toasts | Inherited |
| radix-ui / shadcn | ^1.4.3 / ^4.10.0 | `dialog` (lightbox), `aspect-ratio` | Inherited design system |

### Supporting (NEW dependency required for the zip route)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| archiver | ^7.0.1 [ASSUMED] | Stream a zip of in-scope layers in the download route | Full-set / per-group download (OUT-03). Convert its Node stream to a Web `ReadableStream` via `Readable.toWeb()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| archiver | zip-stream | Lower-level; archiver wraps it and is the higher-level ergonomic choice for "queue N entries, finalize" — [CITED: github.com/archiverjs/node-zip-stream] |
| archiver | Native `CompressionStream` | Web-standard but produces gzip, not multi-entry zip — wrong container for a "download all layers" archive |
| Server zip route | Client-side JSZip fetching `/api/file` per layer | Would work but pulls every blob through the browser; the UI-SPEC explicitly forbids client-side fetch of the set and wants a server-built archive |

**Installation:**
```bash
npm install archiver
npm install -D @types/archiver
```

**Version verification:** `npm view archiver version` was NOT run in this session (offline-leaning environment). Tag `archiver` `[ASSUMED]` — the planner must gate its install behind a `checkpoint:human-verify` task and confirm `npm view archiver version` + that it streams under Node 20/22 on Vercel. archiver is a long-established package (10+ yrs, ~30M weekly downloads as of training data) but registry existence was not re-confirmed this session.

## Package Legitimacy Audit

> slopcheck was not available in this environment; per protocol the new package is tagged `[ASSUMED]` and the planner must gate it behind a `checkpoint:human-verify` task before install.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| archiver | npm | ~10 yrs [ASSUMED] | ~30M/wk [ASSUMED] | github.com/archiverjs/node-archiver | not run | Flagged — planner adds checkpoint:human-verify |
| @types/archiver | npm (DefinitelyTyped) | — | — | github.com/DefinitelyTyped | not run | Flagged — same checkpoint |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none (slopcheck unavailable — `[ASSUMED]` gating instead)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OUT-01 | Completed renders produced as layered outputs: metal pass JPEG, each stone group transparent PNG via holdout | **Gap found.** Recording path: extend webhook/reconcile. Transparency/format: recipe-flag change + format-from-metadata. See OUT-01 section. |
| OUT-02 | Browse a batch's outputs in a gallery organized by product/metal/angle/pass | DB-only Server Component reading `Layer ⋈ Job(combo) ⋈ Batch`. Grouping derives from `Job.combo` `{angleKey, metalKey, pass, stoneGroup}`. |
| OUT-03 | Preview any output; download individual layer OR full set | `/api/file` proxy (preview + single, add `Content-Disposition`); new auth-gated zip route (set/batch). requireSession + IDOR on every path. |

## Layer-Creation Hook (the central Phase-5 design decision)

**Verified state:** `prisma/schema.prisma:171-180` defines `Layer { id, jobId, pass, format, url, metadataUrl, isFlattened }`. `Job.result Json?` persists the worker output (`webhook.ts:52`). **No code anywhere creates a `Layer` row** (confirmed: `batches/[id]/page.tsx:38-45` only *reads* `job.layers` for a thumbnail, with a comment "Phase 5 builds the full gallery"). So Phase 5 owns Layer creation.

**Worker output shape that becomes a Layer** (verified `handler.py:181-188`):
```jsonc
{
  "job_id": "<job id>",
  "image_key":  "renders/<jobId>/<jobId>.png",   // → Layer.url pathname source
  "image_url":  "https://…",                      // public/blob URL (do NOT store as the delivery href)
  "image_blob": { "url", "pathname", "content_type", … },
  "metadata_key":  "renders/<jobId>/<jobId>.json",// → Layer.metadataUrl
  "metadata_blob": { … }
}
```

**Recommendation — create the Layer in the completion writer (extend, don't derive-on-read):**

1. In `applyWebhookResult` (`lib/orchestration/webhook.ts`), the `mapped === "completed"` branch already does `updateMany`. After it lands, call a new pure helper `deriveLayerFromResult(jobId, output)` (in e.g. `lib/orchestration/layers.ts`) that:
   - reads `image_blob.pathname` (preferred) or `image_key` as `Layer.url`,
   - reads `metadata_key`/`metadata_blob.pathname` as `Layer.metadataUrl`,
   - reads `pass` + `stoneGroup` from the job's stored `combo` (NOT from worker output — the worker doesn't echo it),
   - derives `format` from the actual stored content type / extension (see OUT-01),
   - **upserts** keyed on a unique constraint so a duplicate/late webhook (at-least-once delivery, the same hazard `webhook.ts` already guards) does not create a second row.

2. **Idempotency mechanism (REQUIRED):** add a `@@unique` to `Layer`. The natural key is `(jobId, pass, stoneGroup)` — but `stoneGroup` is nullable for metal passes and Postgres treats NULLs as distinct in a unique index. Two clean options:
   - Add `Layer.jobId @unique` IF the invariant "one job = exactly one layer" holds. **It does** — each job renders exactly one pass/image (verified: `expand.ts` produces one row per `(angle×metal×pass)`, `handler.py` uploads exactly one image per job). **Recommend `jobId @unique`** + `prisma.layer.upsert({ where: { jobId }, … })`. This is the simplest idempotent key and matches the 1-job-1-layer reality.
   - (Fallback if the invariant ever loosens: a composite unique on `(jobId, pass)` with a non-null default for stoneGroup.)

3. **Migration impact (Runtime State Inventory):** adding `Layer.jobId @unique` is a schema migration. Existing `Layer` rows: **none** (no creator exists), so the migration is safe/empty. The reconcile path (`reconcile.ts:61`) already replays through `applyWebhookResult`, so putting Layer creation there means the cron fallback gets it for free — no second code path.

**Why not derive-on-read:** the gallery would have to parse every `Job.result` JSON on every page load, re-deriving pass/format, and could not be filtered/grouped at the SQL level. Recording rows once makes the gallery a clean `Layer` query with `where`/`orderBy` pushed to Postgres, and is exactly what P6 compositing will join against.

## OUT-01: Layered-Output Transparency & Format — THE RISK ITEM

**Confirmed gaps (HIGH confidence, all from repo source):**

| Claim | Evidence | Status vs OUT-01 |
|-------|----------|------------------|
| Worker always writes PNG, RGBA | `render_scene.py:756` `file_format="PNG"`, `:757` `color_mode="RGBA"` | Metal pass is NOT JPEG |
| Output always uploaded as `.png`, `image/png` | `handler.py:174` `{job_id}.png`, `:178` `"image/png"` | format is uniform PNG |
| `film_transparent` follows `render.transparent` | `render_scene.py:751` | configurable — good |
| Recipe sets `transparent: false` for ALL passes | `enterprise-recipes.ts:199` | stone pass is NOT transparent |
| Stone pass INCLUDES metal tokens | `enterprise-recipes.ts:150-156` `buildVisibility` stone branch adds `metalTokens` | stone pass renders metal too — NOT a clean holdout |
| `postprocess.studio_background` paints a solid floor/bg | `enterprise-recipes.ts:316-327`, applied in `postprocess.py` | even if film were transparent, postprocess composites an opaque studio bg |

**So a stone pass today = opaque PNG of metal+stone on a studio background. That violates OUT-01's "transparent PNG via holdout."**

**Resolution options the planner MUST choose between (this is a CONTEXT/discuss-phase decision):**

- **Option A — Recipe-level flags only (PREFERRED; no worker code change):** For `pass === "stone"`, set `render.transparent: true`, set `exclude_contains` to the metal tokens (true holdout — stone group only), and **disable** `postprocess.studio_background` (and any opaque-bg postprocess) so the alpha survives. The worker already honors `render.transparent` and already writes RGBA PNG, so a transparent stone PNG falls out with no Python change. For `pass === "metal"`, leave opaque; record `format` as PNG (see Option C on the JPEG question).
- **Option B — Worker change to emit JPEG for metal:** Make `file_format`/content-type recipe-driven so the metal pass uploads `.jpg`/`image/jpeg`. This satisfies OUT-01 literally but the project constraint says "GPU/render engine is reused, not rebuilt" — a worker edit is heavier and should be avoided unless the literal JPEG is mandatory.
- **Option C — Reconcile the "JPEG" wording:** OUT-01 says metal=JPEG, but the UI-SPEC's value is "opaque metal pass on a solid card, no checkerboard." A PNG-opaque metal pass is functionally identical for browse/preview/compositing; the JPEG distinction is only meaningful for file size. **Recommend: store `Layer.format` from the real content type, treat the metal/stone distinction as `pass`-driven (not format-driven) in the UI, and surface to the user whether literal JPEG output is a hard requirement.** The UI-SPEC already keys its checkerboard off `pass`/`format` — if the metal pass stays PNG, the format badge reads `PNG` and the checkerboard is simply suppressed for the metal pass.

**Format derivation for `Layer.format`:** read it from the stored blob's content type (`image_blob.content_type`) or extension, NOT hardcoded — so that if Option B is ever taken, the recorded format is truthful. Until then it will be `image/png` for everything; the UI must therefore distinguish metal vs stone by `combo.pass`, which the UI-SPEC already does.

**[ASSUMED] flag:** whether literal JPEG for the metal pass is mandatory (Option B) vs. acceptable-as-PNG (Option C) is a product decision not resolvable from the repo. This is the #1 item for discuss-phase.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **No existing `Layer` rows** (no creator exists — verified) | Migration to add `Layer.jobId @unique` is safe/empty. Layers populate going forward from the webhook hook; already-completed jobs that predate the hook will have `result` but no Layer → a one-time backfill (iterate `Job` where `status=completed` AND no layer, run `deriveLayerFromResult`) is recommended as a task. |
| Live service config | Worker uploads with `BLOB_ACCESS` default `"public"` (`handler.py:52`) — render outputs are currently PUBLIC, contradicting SEC-02's private model | The gallery proxy assumes `access:'private'`. Either set `BLOB_ACCESS=private` on the worker env AND mint the model-style presigned reads, OR confirm render outputs are private. **Flag: `/api/file` does `get(pathname,{access:'private'})` — if outputs are public-uploaded, the proxy `get` will not find them as private.** This must be reconciled (planner: confirm worker `BLOB_ACCESS` is set to `private` in deploy env, Phase 8/DEPLOY-01 territory but blocks OUT-02/03 delivery). |
| OS-registered state | None | — |
| Secrets/env vars | `BLOB_READ_WRITE_TOKEN` (proxy + zip route read), `AUTH_SECRET` (session) — all already configured; no new secret for Phase 5 | None new |
| Build artifacts | None | — |

## OUT-02: Gallery — DB-only Server Component

**Combo shape (verified `lib/batches/expand.ts:32-38`) — this is the grouping key:**
```ts
type Combo = { angleKey: EnterpriseAngleKey; metalKey: EnterpriseMetal; pass: "metal"|"stone"; stoneGroup?: StoneGroupKey };
```

**⚠ Field-name mismatch to fix:** `batches/[id]/page.tsx:30` reads `c.angle, c.metal, c.stone, c.pass`, but the stored combo keys are `angleKey, metalKey, stoneGroup, pass`. The existing monitor `comboLabel` is reading the wrong field names and silently falls back to `"render"`. The gallery must read the **correct** keys (`angleKey/metalKey/stoneGroup/pass`). The planner should also note (optionally fix) the monitor's stale reader. [VERIFIED: codebase grep]

**Query pattern (DB-only, no RunPod import — enforced by the source guard):**
```ts
// app/(app)/batches/[id]/gallery/page.tsx (or /gallery?batch=)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

await requireSession();                       // FIRST line — AUTH boundary
const { id } = await params;
const batch = await prisma.batch.findUnique({ // IDOR-scoped by params.id
  where: { id },
  include: {
    product: { select: { name: true } },
    jobs: {
      where: { status: "completed" },         // layers exist only for completed jobs
      include: { layers: true },
    },
  },
});
// group in JS by combo.metalKey / angleKey / pass / stoneGroup for the UI-SPEC sections
```

**DB-only discipline (ORCH-02 / source guard):** the gallery page is added to a source guard exactly like `test/orch-db-only.test.ts` — it MUST NOT import `@/lib/runpod`, call `submitRunPod/getRunPodStatus/cancelRunPod`, or match `/\brunpod\b/i`. Add the gallery page + any gallery status route to that guard's `DB_ONLY_FILES` list. Terminal layers never change, so no RunPod re-fetch is ever justified. [VERIFIED: codebase]

**Partial-rendering state:** the gallery shows layers for `completed` jobs only; in-progress jobs simply have no layer rows. The "{c} of {N} done" banner derives from the same `summarizeJobs`/`deriveBatchStatus` the monitor uses (`lib/orchestration/batch-status.ts`) — reuse, do not reinvent. Failed jobs → no layer (calm "{f} failed" note linking to the monitor).

**Thumbnails of private images:** every `<img src>` = `privateUrl(layer.url-pathname)` = `/api/file?pathname=…` (`lib/blob.ts:32`). The 160×160 thumbnail and lightbox both hit the proxy; PNG (stone) gets the checkerboard backing, opaque (metal) gets solid `--card`.

## OUT-03: Preview & Download

**Preview / single-layer download — extend `/api/file`:** the proxy (`app/api/file/route.ts`) already streams private bytes after `requireSession()`. For a **download** (vs inline preview) the only addition is a `Content-Disposition: attachment; filename="…"` header. Recommend an optional `&download=1&name=<human>` param: when present, the proxy adds `Content-Disposition: attachment; filename="${sanitized}"`; when absent, it streams inline as today (preview). The human filename is built from the combo: `{product}_{angle}_{metal}_{group}_{pass}.{ext}` (UI-SPEC §download). [VERIFIED: route source]

**IDOR on downloads:** `/api/file` currently authenticates the session but does NOT verify the caller is allowed *this* pathname — any logged-in user can fetch any pathname they can guess. For Phase 5 this is acceptable for the single-tenant internal team (every authed user is an operator/admin of the one tenant) and matches the existing model. The **zip route** must still scope by `batchId` and load layers via Prisma (so the set is derived from DB rows the user navigated to, not arbitrary pathnames). Note this as the IDOR posture; do not over-engineer per-object ACLs for a single-tenant tool.

**Full-set / per-group zip — NEW route `app/(app)/batches/[id]/download/route.ts` (or `app/api/batches/[id]/download`):**
- `runtime = "nodejs"` (archiver needs Node streams; NOT edge).
- `requireSession()` first; load `batch` by `params.id` (IDOR scope); optional `?scope=metal:white` / `?variant=…` query to narrow to a group.
- For each in-scope `Layer`, `get(pathname,{access:'private'})` and append its stream to an `archiver("zip")` instance; `archive.finalize()`.
- Return `new Response(Readable.toWeb(archive) as ReadableStream, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="…"` } })`. [CITED: ericburel.tech/blog/nextjs-stream-files — `Readable.toWeb()` is the Node→Web stream bridge; archiver is a Node stream]

**60s Vercel cap (the real constraint):** the zip route streams, so it does not buffer the whole archive in memory, but the **wall-clock** to fetch N blobs + zip must finish under `maxDuration: 60` (set globally in `vercel.json` per CLAUDE.md). For a 36-layer batch of ~2-4 MB PNGs this is comfortably fine. Mitigations the planner should bake in: (1) default the full-set button's copy to "Large sets may take a moment" (UI-SPEC already has this), (2) prefer per-group/per-variant zips as the primary affordance for very large batches, (3) if a batch could exceed ~50-80 layers, the planner should cap or paginate the zip scope. Streaming + the existing 60s budget is adequate for current volumes; flag pagination as an Open Question for very large batches.

## Architecture Patterns

### System Architecture Diagram
```
[RunPod worker completes job]
        │  webhook (at-least-once) ──► /api/webhooks/runpod ─► applyWebhookResult()
        │                                                         │ mapped==="completed"
        │  (or) reconcile cron ──► getRunPodStatus ─► applyWebhookResult()
        │                                                         ▼
        │                                          updateMany(Job: status=completed, result=output)
        │                                                         ▼
        │                                          deriveLayerFromResult(jobId, output)  [NEW]
        │                                                         ▼
        │                                          prisma.layer.upsert({where:{jobId}})  [idempotent]
        ▼
[Postgres: Layer ⋈ Job(combo) ⋈ Batch]
        ▲ DB-only read (force-dynamic SC)
        │
[Gallery page] ──img src──► /api/file?pathname=…  (requireSession → get(private) → stream bytes)
        │                                  ▲
        │ click thumb ─► [Lightbox dialog]─┘ full-quality via same proxy
        │
        ├─ "Download layer"  ─► /api/file?pathname=…&download=1&name=…  (attachment)
        └─ "Download set"    ─► /batches/[id]/download?scope=… [NEW route]
                                   requireSession → load Layers by batchId → archiver(zip)
                                   → Readable.toWeb → Response(application/zip)
```

### Recommended Project Structure
```
app/(app)/batches/[id]/
├── gallery/page.tsx          # OUT-02 gallery Server Component (DB-only)
├── download/route.ts         # OUT-03 zip route (nodejs, archiver)
└── gallery/                  # client subcomponents
    ├── layer-card.tsx        # output/layer card + checkerboard (client, for hover/download)
    ├── gallery-controls.tsx  # group-by + filter chips (client)
    └── preview-lightbox.tsx  # shadcn dialog lightbox (client, ←/→/ESC)
lib/orchestration/layers.ts   # deriveLayerFromResult() pure helper + upsert
app/api/file/route.ts         # EXTEND: optional &download=1&name= → Content-Disposition
```

### Pattern: Server Component reads, Client Components for interaction
The gallery page (Server Component) does all Prisma reads and passes plain serializable props down. The layer card, controls, and lightbox are Client Components (`"use client"`) — they hold filter state, hover/download affordances, and keyboard nav, but fetch image bytes only via the `/api/file` proxy `src`. This matches the existing `jobs-monitor.tsx` (client) ⟷ `page.tsx` (server) split. [VERIFIED: codebase pattern]

### Anti-Patterns to Avoid
- **Deriving layers on read** — re-parses `Job.result` every load, can't push grouping/filtering to SQL.
- **Storing/serving the worker's `image_url` (public blob URL) as the delivery href** — violates SEC-02. Always re-derive the `/api/file` proxy URL from the pathname.
- **Importing `lib/runpod` in the gallery** — breaks the DB-only source guard.
- **Buffering the whole zip in memory** — stream via `Readable.toWeb`; never `await archive` into a Buffer.
- **Per-request RunPod polling from the gallery** — terminal layers never change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zip archive of N blobs | Manual zip byte assembly | `archiver` | Central-directory + CRC + streaming correctness is non-trivial |
| Node→Web stream bridge | Custom ReadableStream pump | `Readable.toWeb()` (node:stream) | Built-in since Node 17; correct backpressure |
| Idempotent layer create | "check then insert" | `prisma.upsert({where:{jobId}})` | Race-free against duplicate webhooks |
| Private-blob delivery | New signed-URL scheme | existing `/api/file` proxy | Private blobs have NO signed-URL API (RESEARCH Pitfall 5, repo-documented) |
| Auth on download | New auth check | `requireSession()` | Existing boundary; throws fail-closed Response |
| Pass/combo grouping | New combo parser | read `Job.combo` `{angleKey,metalKey,pass,stoneGroup}` | The shape is already persisted by expand.ts |

## Common Pitfalls

### Pitfall 1: Combo field-name drift
**What goes wrong:** Reading `combo.angle/metal/stone` (the monitor's bug) yields `undefined`; grouping silently collapses.
**How to avoid:** Use `angleKey/metalKey/stoneGroup/pass`. Add a typed `Combo` parse helper shared with `expand.ts`.
**Warning signs:** Every card labeled "render"; one giant group.

### Pitfall 2: Public-uploaded outputs vs private proxy
**What goes wrong:** Worker uploads with `BLOB_ACCESS=public` default; `/api/file` does `get(...,{access:'private'})` → 404 for every thumbnail.
**How to avoid:** Confirm worker deploy env sets `BLOB_ACCESS=private`. Verify a real completed job's blob is private before wiring the gallery. (Runtime State Inventory item.)
**Warning signs:** All thumbnails 404 through the proxy while the raw `image_url` works.

### Pitfall 3: Duplicate webhook → duplicate Layer
**What goes wrong:** RunPod delivers the completion webhook >1×; a non-idempotent insert creates duplicate Layer rows.
**How to avoid:** `Layer.jobId @unique` + `upsert`. The completion `updateMany` is already terminal-guarded; layer upsert is the matching idempotency for the new write.

### Pitfall 4: Stone pass not actually a holdout
**What goes wrong:** OUT-01 "transparent PNG" silently unmet because recipe `transparent:false` + stone pass includes metal + opaque postprocess bg.
**How to avoid:** OUT-01 Option A recipe flags (transparent:true, exclude metal tokens, disable studio_background for stone passes). Verify alpha coverage on a real render before claiming OUT-01.
**Warning signs:** Stone-pass PNG opens with a solid white/studio background; alpha channel all-255.

### Pitfall 5: Zip route on edge / 60s overrun
**What goes wrong:** archiver needs Node streams (not edge); a huge batch zip overruns 60s.
**How to avoid:** `runtime="nodejs"`; stream (don't buffer); prefer per-group zips; cap/paginate very large sets.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 (verified package.json) |
| Config file | `vitest.config.*` + `test/setup.ts` (env loader + `fakeSession`/`testPrisma`) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |
| Mocking style | `vi.mock("@/lib/db/prisma")`, `vi.mock("@vercel/blob")`; source-text guards via `readFileSync` (see `orch-db-only.test.ts`, `blob-guard.test.ts`) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| OUT-01 | `deriveLayerFromResult` maps worker output → Layer fields; pass/stoneGroup from combo; format from content type | unit | `npx vitest run test/out-layer-derive.test.ts` | ❌ Wave 0 |
| OUT-01 | Layer creation is idempotent (duplicate webhook → one row via upsert) | unit (mock prisma) | `npx vitest run test/out-layer-idempotent.test.ts` | ❌ Wave 0 |
| OUT-01 | Stone-pass recipe sets `transparent:true` + excludes metal tokens + disables studio bg (if Option A chosen) | unit | `npx vitest run test/out-stone-transparency.test.ts` | ❌ Wave 0 |
| OUT-02 | Gallery groups layers correctly by metal/angle/pass from `Job.combo` | unit (pure grouping fn) | `npx vitest run test/out-gallery-group.test.ts` | ❌ Wave 0 |
| OUT-02 | Gallery page imports no RunPod I/O (DB-only source guard) | source guard | `npx vitest run test/orch-db-only.test.ts` (add gallery path to DB_ONLY_FILES) | ✅ extend existing |
| OUT-02 | Gallery query filters to `completed` jobs only | unit (mock prisma) | `npx vitest run test/out-gallery-query.test.ts` | ❌ Wave 0 |
| OUT-03 | `/api/file` denies unauthenticated download (401) + adds Content-Disposition when `download=1` | unit | `npx vitest run test/out-file-download.test.ts` | ❌ Wave 0 |
| OUT-03 | Zip route requires session, scopes by batchId, streams application/zip | unit (mock blob+prisma+archiver) | `npx vitest run test/out-zip-route.test.ts` | ❌ Wave 0 |
| OUT-03 | Zip route source-guard: no public URL construction, uses get(private) | source guard | add to `blob-guard.test.ts` | ✅ extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run <the-touched-test-file>`
- **Per wave merge:** `npx vitest run` (full suite green)
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/out-layer-derive.test.ts` — OUT-01 mapping
- [ ] `test/out-layer-idempotent.test.ts` — OUT-01 upsert idempotency
- [ ] `test/out-stone-transparency.test.ts` — OUT-01 recipe flags (if Option A)
- [ ] `test/out-gallery-group.test.ts` — OUT-02 grouping
- [ ] `test/out-gallery-query.test.ts` — OUT-02 completed-only read
- [ ] `test/out-file-download.test.ts` — OUT-03 proxy auth + disposition
- [ ] `test/out-zip-route.test.ts` — OUT-03 zip auth + content
- [ ] Extend `test/orch-db-only.test.ts` DB_ONLY_FILES + `test/blob-guard.test.ts`
- [ ] Framework install: none (Vitest present)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireSession()` first line of gallery page, `/api/file`, zip route |
| V4 Access Control | yes (IDOR) | Batch loaded by `params.id` via Prisma; zip scope derived from DB rows, not arbitrary pathnames. Single-tenant: every authed user is in-tenant |
| V5 Input Validation | yes | Validate `pathname`, `download`, `name`, `scope` query params; sanitize the `Content-Disposition` filename (strip CR/LF/quotes) |
| V6 Cryptography | no | No new crypto; private-blob access is the existing token |
| V12 Files/Resources | yes | Path traversal in `pathname`/`name`; `nosniff` already set; no user-controlled file write |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Header injection via download filename | Tampering | Sanitize/escape filename in `Content-Disposition` (strip CR/LF, quote) |
| Arbitrary blob read via guessed pathname | Information Disclosure | Single-tenant authed-only is acceptable; zip route derives scope from DB rows |
| Public render outputs bypass proxy | Information Disclosure | Ensure worker `BLOB_ACCESS=private`; SEC-02 |
| Unauthed gallery/download | Spoofing | `requireSession()` fail-closed Response on every entry |

## State of the Art
| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blob-JSON job state (legacy) | Postgres `Job`/`Layer` rows | Phase 1/4 | Gallery is a SQL query, not a blob `list()` scan |
| Public blob URLs (legacy worker default) | Private blob + `/api/file` proxy | Phase 1 (SEC-02) | Worker `BLOB_ACCESS` must be flipped to private |
| `Readable.toWeb` manual polyfills | Built-in node:stream `Readable.toWeb` | Node 17+ | No polyfill needed on Vercel Node runtime |

## Assumptions Log
| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Literal JPEG for the metal pass is NOT mandatory; PNG-opaque is acceptable (Option C) | OUT-01 | If JPEG mandatory, a worker code change (Option B) is needed — heavier scope |
| A2 | `archiver ^7` exists/streams on Vercel Node | Standard Stack | Install gated behind checkpoint:human-verify; could need zip-stream instead |
| A3 | Worker render outputs are (or will be set) private (`BLOB_ACCESS=private`) | Runtime State Inventory | If outputs stay public, `/api/file` private `get()` 404s — delivery broken |
| A4 | One job = exactly one Layer (justifies `Layer.jobId @unique`) | Layer-Creation Hook | If a job ever emits multiple layers, need composite unique key |
| A5 | Single-tenant per-object IDOR is acceptable (no per-user object ACL) | OUT-03 Security | If multi-user object isolation is later required, downloads need ownership checks |

## Open Questions
1. **Metal-pass JPEG: literal requirement or PNG-acceptable?** Recommendation: surface in discuss-phase; default to PNG + `pass`-driven UI (A1).
2. **Worker `BLOB_ACCESS` — confirmed private in deploy env?** Recommendation: verify against a real completed job before wiring thumbnails; this blocks OUT-02/03 delivery (A3).
3. **Very large batches (>~50-80 layers) zip pagination?** Recommendation: per-group zips as primary; cap full-set scope or paginate if needed (60s budget).
4. **Backfill existing completed jobs?** Recommendation: a one-time task iterating `Job{status:completed, layers:none}` → `deriveLayerFromResult`, since the hook only runs on future completions.

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | tests | ✓ | ^4.1.8 | — |
| @vercel/blob | proxy + zip | ✓ | ^2.4.0 | — |
| Prisma | reads/upsert | ✓ | 6.19.2 | — |
| archiver | zip route | ✗ | — | zip-stream, or per-layer client JSZip (discouraged) |
| Node `Readable.toWeb` | stream bridge | ✓ (Node 17+) | platform | — |

**Missing dependencies with fallback:** archiver (install required; zip-stream is the fallback).

## Sources
### Primary (HIGH confidence)
- Repo source: `prisma/schema.prisma`, `lib/orchestration/webhook.ts`, `lib/orchestration/reconcile.ts`, `lib/orchestration/dispatch.ts`, `lib/enterprise-recipes.ts`, `lib/batches/expand.ts`, `workers/runpod-blender/handler.py`, `workers/runpod-blender/render_scene.py`, `app/api/file/route.ts`, `lib/blob.ts`, `lib/auth/rbac.ts`, `app/(app)/batches/[id]/page.tsx`, `test/orch-db-only.test.ts`, `test/setup.ts`, `test/factories.ts` — all read this session.
- `.planning/phases/05-outputs-gallery-layered-passes/05-UI-SPEC.md` (approved design contract).
- `.planning/REQUIREMENTS.md` (OUT-01..03).

### Secondary (MEDIUM confidence)
- [CITED: ericburel.tech/blog/nextjs-stream-files] Next.js Route Handler file streaming + `Readable.toWeb()`.
- [CITED: github.com/archiverjs/node-zip-stream] archiver vs zip-stream layering.

### Tertiary (LOW confidence)
- archiver version/registry status — `[ASSUMED]`, gated behind checkpoint:human-verify.

## Metadata
**Confidence breakdown:**
- Layer-creation hook: HIGH — schema, webhook, reconcile, and absence-of-creator all verified in source.
- OUT-01 transparency gap: HIGH — every claim traced to a specific repo line.
- Gallery DB-only pattern: HIGH — matches existing monitor + source-guard test.
- Zip approach: MEDIUM — pattern verified, `archiver` version unconfirmed this session.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable repo; re-verify archiver before install)
