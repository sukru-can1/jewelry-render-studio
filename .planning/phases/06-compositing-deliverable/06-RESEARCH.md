# Phase 6: Compositing & Deliverable - Research

**Researched:** 2026-06-09
**Domain:** Server-side image compositing (sharp) over private-Blob layers + per-variant/batch deliverable delivery, in the Next.js Node runtime
**Confidence:** HIGH (codebase-grounded; sharp@0.34.5 resolvable verified; all delivery/auth/zip patterns reuse Phase 5 code read this session)

## Summary

Phase 6 takes the per-pass `Layer` rows that Phase 5 already records (one row per completed `angle × metal × pass` job) and turns each **(angle × metal)** *variant* into one flattened, catalog-ready image. The render pipeline and Layer recording are done — Phase 6 adds three things, all in the **Next.js/Node layer** (RunPod/Blender is NOT involved): (1) a **client** stacked-layer preview with per-layer toggle (COMP-01, lightweight — it just needs the variant's ordered layer list + `/api/file` URLs), (2) a **server** flatten route that fetches each layer's bytes from private Blob, composites them with `sharp` in deterministic z-order, runs a **validation gate** (identical dimensions + base-layer present + non-trivial stone alpha), and persists the result (COMP-02), and (3) **download** of a single variant deliverable or a whole-batch zip (COMP-03), reusing the exact `/api/file` proxy + `ZipArchive` patterns already in the repo.

The central design decision is the **compositing "variant" key**. `lib/gallery/group.ts`'s existing `"variant"` mode is per-pass/metal-stone identity and is **NOT** the compositing key — the compositing variant is `(angleKey, metalKey)`, and its layers are the **metal pass (opaque, BOTTOM)** plus **each stone-group transparent PNG (OVER)** in deterministic z-order. A new pure grouping function (`groupVariantsForCompositing`) keyed on `${angleKey}:${metalKey}` is needed; do not overload `group.ts`'s `variant` mode.

**Primary recommendation:** Add a Node-runtime route `app/(app)/batches/[id]/flatten/route.ts` (POST, on-demand per-variant) that: `requireSession()` → IDOR-scope batch by `params.id` → load the variant's layers via Prisma → `get(pathname,{access:'private'})` each → `Buffer` them → `sharp(metalBuf).metadata()`/`.stats()` + each stone `.metadata()`/`.stats()` to run the validation gate → on PASS `sharp(metalBuf).composite([{input: stoneBuf}, …]).png()` (or `.jpeg()`) → `putPrivate('renders/<batchId>/deliverables/<angle>_<metal>.<ext>', buf, {allowOverwrite:true})` → `prisma.layer.upsert` an `isFlattened:true` row. Batch download reuses the existing `ZipArchive` zip route, extended to zip **flattened** deliverables (flattening any missing ones lazily, capped) instead of raw layers. Stay under the 60s cap by flattening **one variant per request** (a few layers, fast) and never flattening a whole batch synchronously in one call.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stacked-layer preview + per-layer toggle (COMP-01) | Browser (client component) | API proxy (`/api/file` for bytes) | Pure presentational stacking of `<img>` layers with CSS `position:absolute` + opacity/visibility toggles; no server compute |
| Variant grouping `(angle × metal)` + z-order | API/Backend (pure lib fn) | — | Deterministic ordering is a pure function unit-tested in isolation; consumed by both flatten route and preview |
| Fetch private layer bytes for compositing | API/Backend (`get(private)` in route) | Blob store | Token-scoped private read MUST be server-side (SEC-02); sharp needs a Buffer, not a URL |
| Composite + validation gate (COMP-02) | API/Backend (sharp in Node route) | — | `sharp` is a native Node addon — Node runtime only, never edge/browser; CPU+memory bound, must respect 60s |
| Persist deliverable | API/Backend (`putPrivate` + `prisma.upsert`) | Blob + DB | Deliverable is a new private blob + an `isFlattened` Layer row (idempotent overwrite) |
| Download single deliverable (COMP-03) | API/Backend (`/api/file` proxy) | Browser | Reuse the auth-gated attachment proxy verbatim |
| Download batch zip (COMP-03) | API/Backend (`ZipArchive` route) | Blob | Stream a zip of already-flattened deliverables; reuse the existing `download/route.ts` pattern |

## Standard Stack

### Core (all already installed — verified in package.json / node_modules)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | 0.34.5 | Composite layers, read `metadata()` (w/h) + `stats()` (alpha), encode PNG/JPEG | **Verified resolvable this session** (`require('sharp/package.json').version === '0.34.5'`). The de-facto Node image library; libvips-backed, fast, low-memory, streaming-capable |
| @prisma/client | 6.19.2 | Load variant layers; upsert `isFlattened` Layer | Existing data layer |
| @vercel/blob | ^2.4.0 | `get(pathname,{access:'private'})` to fetch layer bytes; `put(…,{access:'private',allowOverwrite:true})` to persist deliverable | Existing private store (SEC-02); `lib/blob.ts` `putPrivate`/`privateUrl` helpers already wrap it |
| archiver | ^8.0.0 | `ZipArchive` batch-of-deliverables zip | **Already installed + used** in `app/(app)/batches/[id]/download/route.ts` |
| next-auth | 5.0.0-beta.31 | `requireSession()` on every route | Existing auth boundary |
| react / lucide-react / sonner / radix-ui | (installed) | COMP-01 preview UI (toggles, layer chips, download toasts, dialog) | Inherited design system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:stream `Readable` | platform | `Readable.fromWeb(result.stream)` → Buffer; `Readable.toWeb` for zip | Already used in `download/route.ts`; needed to turn a private-blob web stream into a Buffer for sharp |

**No new dependency is required for Phase 6.** sharp and archiver are both already present. This is the single most important stack finding: nothing to install, so **no Package Legitimacy Audit gate blocks this phase**.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sharp `.composite()` | `canvas` / `@napi-rs/canvas` | Heavier, slower, larger cold-start on Vercel; sharp is purpose-built for layer compositing and already installed |
| sharp `.composite()` | Jimp (pure JS) | No native deps but far slower and more memory-hungry for 1920² PNGs; sharp's libvips is the right tool |
| Client-side compositing (canvas) for the deliverable | — | Would put the catalog-ready output on an untrusted client and bypass the validation gate; COMP-02 explicitly says SERVER flatten |

**Installation:** none. (`sharp@0.34.5` and `archiver@^8.0.0` already in the dependency tree.)

**Version verification:** `sharp` confirmed at runtime this session: `node -e "require('sharp/package.json').version"` → `0.34.5`. `archiver@^8.0.0` confirmed in `package.json` and actively imported by the existing zip route. No registry round-trip needed because both are already installed and exercised by shipped code.

## Package Legitimacy Audit

> No external packages are installed in this phase — both `sharp` and `archiver` are already present and used by shipped code. The legitimacy gate is therefore N/A for Phase 6.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| sharp | npm | already installed (0.34.5) | n/a (pre-installed) | github.com/lovell/sharp | not run (no install) | Already present — no gate |
| archiver | npm | already installed (^8.0.0) | n/a (pre-installed) | github.com/archiverjs/node-archiver | not run (no install) | Already present + used in repo |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMP-01 | In-browser stacked-layer preview with per-layer toggle | Client component stacks `<img src=/api/file?pathname=…>` absolutely positioned in z-order; toggles flip `visibility`/`opacity`. Data shape it needs: the variant's ordered layers `[{ pass, stoneGroup, url(pathname), format }]` from the new `groupVariantsForCompositing` fn. No server compute. |
| COMP-02 | SERVER flatten a variant's layers into one correctly-aligned image, per variant, WITH validation gate (identical dims + non-trivial alpha → WARN not silent flatten) | New `flatten/route.ts` (Node): fetch bytes → `sharp().metadata()`/`.stats()` validation gate → `sharp(base).composite([...]).png()`/`.jpeg()` → `putPrivate(allowOverwrite)` → upsert `isFlattened` Layer. Structured warning shape defined below. |
| COMP-03 | Download flattened deliverable per variant OR whole batch (zip) | Single: reuse `/api/file?pathname=…&download=1&name=…`. Batch: reuse `ZipArchive` route, zipping `isFlattened` deliverables (lazily flatten missing ones, capped). |

## The Compositing "Variant" — central design decision

**A compositing variant = `(angleKey, metalKey)`.** Its layers, in z-order from bottom to top:

1. **BASE (bottom):** the `pass === "metal"` layer for that `(angle, metal)` — opaque. (Verified: `lib/enterprise-recipes.ts` emits a `metal` pass per angle×metal; Phase 5 records it as a `Layer{pass:"metal"}`.)
2. **OVER (each, on top):** every `pass === "stone"` layer for that `(angle, metal)`, one per `stoneGroup` — transparent PNGs (holdout). Composited in a **deterministic stoneGroup order** (sort by `ObjectGroup.sortOrder` if available, else stable alphabetical of `stoneGroup`).

**Why `group.ts`'s `"variant"` is the WRONG key:** `bucketKey` for `variant` returns `variant:${metalKey}:${stoneGroup ?? pass}` (`lib/gallery/group.ts:57-59`) — it splits by stone group and ignores `angleKey`. That is a *gallery presentation* bucket, not a compositing unit. The compositing unit must hold ALL passes for one angle+metal together. **Recommendation:** add a NEW pure function (do not modify `group.ts`'s contract, which is guarded by `test/out-gallery-group.test.ts`):

```ts
// lib/compositing/variants.ts  (PURE — no prisma/react/runpod; unit-testable)
export type CompositingLayer = {
  pass: string;            // "metal" | "stone"
  stoneGroup?: string;     // present for stone passes
  url: string;             // BLOB PATHNAME (never public)
  format: string;
  sortOrder?: number;      // from ObjectGroup, optional
};
export type Variant = {
  key: string;             // `${angleKey}:${metalKey}`
  angleKey: string;
  metalKey: string;
  base?: CompositingLayer;       // the metal pass (may be MISSING → WARN later)
  overlays: CompositingLayer[];  // stone passes in deterministic z-order
};
export function groupVariantsForCompositing(layers: readonly LayerWithCombo[]): Variant[];
// z-order: base first; overlays sorted by (sortOrder ?? Infinity, stoneGroup) ascending.
```

This is the #1 pure unit-test target.

## sharp Composite Pipeline (COMP-02) — concrete API

### Step 1 — fetch each layer's bytes from PRIVATE Blob inside the Node route

Private blobs have **no public/signed-URL delivery** (RESEARCH Pitfall 5, repo-documented). Inside the route, read by pathname with the server token:

```ts
import { get } from "@vercel/blob";
import { Readable } from "node:stream";

async function fetchLayerBuffer(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: "private" });   // server token (BLOB_READ_WRITE_TOKEN)
  if (!result || result.statusCode !== 200) {
    throw new Error(`layer not found: ${pathname}`);
  }
  // result.stream is a Web ReadableStream; convert to a Node stream then Buffer.
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(result.stream as never)) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
```

> **Why Buffer, not URL:** sharp `.composite({input})` accepts a Buffer/path/Stream but NOT a remote URL. The layer is private, so the worker's `image_url` cannot be used (SEC-02). Buffer it server-side. **`@vercel/blob` `get` returns `{ statusCode, blob:{contentType,…}, stream }`** — verified against `app/api/file/route.ts:31-37` and `download/route.ts:78-83`. [VERIFIED: codebase]

### Step 2 — read dimensions + alpha for the validation gate

```ts
import sharp from "sharp";

const baseMeta = await sharp(baseBuf).metadata();   // { width, height, channels, hasAlpha, format }
// For each layer compute alpha coverage from channel stats:
const stoneStats = await sharp(stoneBuf).stats();   // { channels: [...], isOpaque, ... }
// channels[3] is the ALPHA channel when present; stats().isOpaque is a fast shortcut.
```

- `sharp(buf).metadata()` → `width`, `height`, `channels`, `hasAlpha`, `format`. Used for the **dimension** check. [CITED: sharp.pixelplumbing.com/api-input#metadata]
- `sharp(buf).stats()` → `{ channels: [{min,max,mean,…}], isOpaque, … }`. For an RGBA PNG the **4th channel (`channels[3]`) is alpha**; a fully-transparent (empty) layer has `channels[3].max === 0`, and a fully-opaque one has `stats.isOpaque === true`. Use `channels[3].mean` (0–255) as the **alpha-coverage** proxy. [CITED: sharp.pixelplumbing.com/api-input#stats]

### Step 3 — composite in z-order (only if gate PASSES)

```ts
const out = await sharp(baseBuf)              // metal pass = opaque base
  .composite(overlayBuffers.map((input) => ({ input, blend: "over" })))  // stone PNGs, z-ordered
  .png()                                       // OR .jpeg({ quality: 92, mozjpeg: true })
  .toBuffer();
```

- `blend: "over"` is the standard alpha-over (Porter-Duff) operator and the sharp default; passing it explicitly documents intent. `composite` honors array order = z-order (first element = lowest overlay). [CITED: sharp.pixelplumbing.com/api-composite]
- **Alignment:** because every layer is the SAME render resolution (all passes for a variant share the recipe's `QualityPreset` resolution — `render_scene.py:749` sets `resolution_x/y` from the recipe), a plain `composite` with no `top/left` is correctly aligned (0,0 origin, equal dims). The validation gate's dimension check is what *guarantees* this precondition holds.

### Step 4 — choose output format (RECOMMENDATION: PNG)

**Recommend PNG for the deliverable**, with JPEG as an admin/size option:
- The base (metal) pass and stone overlays are already PNG; the composited catalog image has no transparency requirement of its own (it sits on the opaque metal base), but PNG preserves the full-quality jewelry edges/sparkle with no chroma subsampling. Catalog imagery quality > file size for an internal tool.
- If file size becomes a concern, `.jpeg({ quality: 92, mozjpeg: true })` is the fallback (flatten onto white first via `.flatten({ background: '#ffffff' })` since JPEG has no alpha). **Default PNG; surface JPEG-vs-PNG as a discuss-phase question** (mirrors Phase 5's OUT-01 metal-format open question). `[ASSUMED]` PNG acceptable.

## Validation Gate (COMP-02) — exact checks + warning shape

Run BEFORE compositing. If any check fails, **return a structured warning and DO NOT write a deliverable** (the requirement: "must WARN, not silently flatten").

| Check | Condition | Warning code |
|-------|-----------|--------------|
| Base present | a `pass === "metal"` layer exists for the variant | `missing-base` |
| Dimensions identical | every layer's `metadata().width`/`height` equals the base's | `dimension-mismatch` |
| Non-trivial stone alpha | for each stone layer, `stats().channels[3].max > 0` (not fully transparent); recommend `channels[3].mean >= MIN_ALPHA_MEAN` (e.g. `>= 1.0` out of 255 = at least some coverage) | `empty-layer` |
| At least one overlay (soft) | variant has ≥1 stone layer | `no-overlays` (WARN, but may still flatten base-only if product is metal-only — treat as advisory) |

**Structured warning shape returned to the UI (and stored nowhere — recomputed on demand):**

```ts
type FlattenWarning = {
  code: "missing-base" | "dimension-mismatch" | "empty-layer" | "no-overlays";
  message: string;                 // human-readable, UI-safe
  layer?: { pass: string; stoneGroup?: string; url: string };  // the offending layer
  detail?: {                       // numeric evidence for the operator
    expectedWidth?: number; expectedHeight?: number;
    actualWidth?: number; actualHeight?: number;
    alphaMean?: number; alphaMax?: number;
  };
};

type FlattenResult =
  | { ok: true; deliverable: { url: string; format: string; width: number; height: number } }
  | { ok: false; warnings: FlattenWarning[] };   // HTTP 200 with ok:false (a WARN, not a 500)
```

**Severity rule:** `missing-base` and `dimension-mismatch` are **hard-block** (cannot produce a correct deliverable → `ok:false`, no write). `empty-layer` is **block per requirement** ("empty layers must WARN, not silently flatten") → `ok:false` listing the empty layer(s). `no-overlays` is **advisory** — if a product is genuinely metal-only the operator may still want the base as the deliverable; surface the warning but allow an explicit `?force=1` to flatten base-only. Return HTTP **200** with `{ok:false, warnings}` so the client renders a calm warning panel (a 4xx/5xx is reserved for auth/IDOR/server faults).

**Validation logic must be a PURE function** taking mock metadata/stats (not the route, not sharp) so it is unit-testable:

```ts
// lib/compositing/validate.ts (PURE)
export function validateVariant(input: {
  base?: { width: number; height: number };
  overlays: { stoneGroup?: string; width: number; height: number; alphaMax: number; alphaMean: number }[];
  minAlphaMean?: number;
}): FlattenWarning[];   // empty array = PASS
```

The route does the sharp I/O (metadata/stats), then hands plain numbers to `validateVariant`.

## 60s Vercel Cap Strategy (the real constraint)

`vercel.json` sets `maxDuration: 60` on every `app/api/**` route (CLAUDE.md). sharp compositing of a few 1920² PNGs is ~hundreds of ms each; the risk is **flattening a whole batch (many variants) in one request**, plus blob-fetch wall-clock.

**Recommended architecture:**

1. **Per-variant, on-demand flatten (PRIMARY).** `POST /batches/[id]/flatten` flattens **exactly ONE variant** (identified by `?angle=…&metal=…` or a body). A variant = 1 metal base + a handful of stone overlays = a handful of blob fetches + one composite. Comfortably sub-second to a few seconds. This is the COMP-02 unit and never risks the 60s ceiling.
2. **Idempotent + cached.** Re-flattening checks for an existing `isFlattened` Layer and overwrites it (`allowOverwrite:true`), so a second click is cheap and deterministic.
3. **Batch download (COMP-03) zips ALREADY-FLATTENED deliverables.** Extend the existing `download/route.ts` to filter `layers` to `isFlattened:true` (the deliverables), `get` each, and `ZipArchive` them — exactly the shipped pattern. For variants **not yet flattened**, flatten them **lazily and capped**: flatten up to N (e.g. 8–12) missing variants inline within the request budget; if more remain, return a partial zip plus a header/JSON note ("X of Y deliverables included; open each variant to flatten the rest") rather than overrunning 60s. Streaming the zip (`Readable.toWeb`) keeps memory flat.
4. **Memory (sharp buffers):** buffer **one variant's layers at a time**, composite, free, move on. Never hold all batch buffers simultaneously. Each 1920² RGBA PNG decompresses to ~15 MB raw in libvips during processing; a single variant (1 base + ~3 overlays) is well within a Vercel function's memory. The zip route streams blob → archive without decoding (it just repackages bytes), so its memory is bounded regardless of layer count.
5. **NOT recommended:** a single synchronous "flatten entire batch" endpoint. If a future requirement needs whole-batch pre-flatten, that belongs in a background/queued job (out of scope; flag as Open Question), not a 60s HTTP route.

## Persistence & Idempotency (deliverable as an isFlattened Layer)

**Recommendation: persist each deliverable as a `Layer` row with `isFlattened:true`.** The schema already has `isFlattened Boolean @default(false)` (`schema.prisma:182`) — it was added FOR this. But there is a **constraint conflict to resolve**: `Layer.jobId` is `@unique` (`schema.prisma:176`) and a deliverable is NOT produced by a single job (it's derived from multiple layers/jobs). Two clean options the planner must choose:

- **Option A (PREFERRED) — relax the unique + add a deliverable identity.** Change `Layer.jobId` from required-`@unique` to **nullable** (deliverables have no single `jobId`), and add a composite unique for deliverable idempotency: e.g. add `batchId String?`, `angleKey String?`, `metalKey String?` and `@@unique([batchId, angleKey, metalKey, isFlattened])` — so re-flattening a variant upserts the same row. This is a **schema migration** (Runtime State Inventory item). Source layers keep `jobId` non-null; deliverables set `jobId = null`. *Caveat:* making `jobId` nullable means the Phase-5 `upsert({where:{jobId}})` must keep using `jobId` for source layers (still unique among non-null via a partial/filtered unique index, or keep `@unique` and only ever insert deliverables with a synthetic `jobId`).
- **Option B (lighter migration) — synthetic deliverable jobId.** Keep `jobId @unique`; store the deliverable's identity AS the `jobId` value using a deterministic synthetic key like `deliverable:<batchId>:<angle>:<metal>`. `upsert({where:{jobId: synthKey}})` is then idempotent with NO schema change. `pass` = `"flattened"`, `isFlattened:true`, `url` = the deliverable pathname. **This is the smallest change and is recommended unless the planner wants first-class deliverable columns.** `[ASSUMED]` the synthetic-jobId approach is acceptable; surface in discuss-phase.

**Blob pathname convention (recommended):**
```
renders/<batchId>/deliverables/<angleKey>_<metalKey>.png
```
Rationale: keeps deliverables under the same `renders/<batchId>/` namespace the worker already uses (`renders/<jobId>/…`, `dispatch.ts:108`), in a `deliverables/` subfolder so they never collide with raw layer outputs and are trivially listable/zippable. Write with `putPrivate(pathname, buf, { allowOverwrite: true })` (forces `access:'private'`, `lib/blob.ts:19-25`) so re-flatten overwrites in place — idempotent at the Blob level too. The `<angle>_<metal>` stem must be sanitized (the same `sanitizeFilename` shape used by the download routes).

> **Note — `<model>` vs `<batchId>`:** the task brief suggested `outputs/<model>/<batchId>/deliverables/…`; the repo's actual worker prefix is `renders/<jobId>/…` (NOT `outputs/<model>/…` — `outputs/<model>/` is a legacy `lib/jobs.ts` convention). Recommend `renders/<batchId>/deliverables/<angle>_<metal>.png` to match the live `renders/` namespace. `[VERIFIED: codebase — dispatch.ts:108, handler.py:85]`

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `Layer` rows are source layers (`isFlattened:false`); **no deliverable rows exist** (no flatten code exists yet). | Migration depends on persistence option: Option A = schema migration (nullable `jobId` + deliverable columns + composite unique) on existing data; Option B = NO schema change (synthetic jobId). Existing source rows are untouched either way. |
| Live service config | Render outputs are written by the worker; this phase only READS them and WRITES new deliverables. Worker `BLOB_ACCESS` must be `private` for `get(...,{access:'private'})` to find layers (Phase 5 open item A3). | Confirm a real completed layer is readable via `/api/file` before wiring flatten (inherited Phase-5 dependency). |
| OS-registered state | None | — |
| Secrets/env vars | `BLOB_READ_WRITE_TOKEN` (private get + put), `AUTH_SECRET` (session) — all already configured. **No new secret for Phase 6.** | None new |
| Build artifacts | `sharp` ships prebuilt platform binaries (libvips). It is already installed/resolvable locally (0.34.5). On Vercel, the linux-x64 binary must be present in the deployed bundle. | Verify sharp loads in the Vercel build (it's a common gotcha — `sharp` must NOT be in `serverExternalPackages` exclusion lists incorrectly; Next 15 bundles it for Node routes by default). Flag as a deploy-smoke check, not a blocker. |

## Architecture Patterns

### System Architecture Diagram
```
[Phase-5 Layer rows: source passes]  Layer{pass:"metal"|"stone", url=pathname, combo via Job}
        │
        │  groupVariantsForCompositing(layers)  [PURE]  → Variant{angle,metal, base, overlays[]}
        ▼
COMP-01 PREVIEW (client)                COMP-02 FLATTEN (server, Node)
[stack <img src=/api/file?…>]            POST /batches/[id]/flatten?angle=&metal=
  absolute-positioned, z-ordered           │ requireSession()  ── AUTH first
  per-layer visibility toggle               │ batch = findUnique(params.id)  ── IDOR
                                            │ load variant layers (prisma)
                                            │ get(pathname,{private}) → Buffer  (per layer)
                                            │ sharp().metadata()/.stats()  ─► validateVariant() [PURE]
                                            │        │ warnings? ─► 200 {ok:false, warnings[]}  (NO write)
                                            │        ▼ PASS
                                            │ sharp(base).composite([overlays]).png()
                                            │ putPrivate('renders/<batchId>/deliverables/<a>_<m>.png',
                                            │            buf, {allowOverwrite:true})
                                            │ prisma.layer.upsert(isFlattened:true)  [idempotent]
                                            ▼
                                  200 {ok:true, deliverable:{url,…}}
        ┌───────────────────────────────────────────────────────────────┐
COMP-03 DOWNLOAD
  single  ─► /api/file?pathname=<deliverable>&download=1&name=<a>_<m>.png   (reuse proxy)
  batch   ─► GET /batches/[id]/download?deliverables=1                       (reuse ZipArchive)
              requireSession → load isFlattened layers → get(private) each
              → ZipArchive.append(Readable.fromWeb) → Readable.toWeb → Response(application/zip)
              (lazily flatten up to N missing variants, capped under 60s)
```

### Recommended Project Structure
```
lib/compositing/
├── variants.ts          # PURE groupVariantsForCompositing() + z-order
├── validate.ts          # PURE validateVariant() → FlattenWarning[]
└── flatten.ts           # sharp orchestration helper (fetch buffers → gate → composite → buffer)
app/(app)/batches/[id]/
├── flatten/route.ts     # POST per-variant flatten (Node runtime)  — COMP-02
├── download/route.ts    # EXTEND: ?deliverables=1 zips isFlattened layers — COMP-03
└── gallery/
    └── variant-preview.tsx  # client stacked-layer preview + toggles — COMP-01
app/api/file/route.ts    # REUSE as-is for single-deliverable download (&download=1&name=)
```

### Pattern: PURE compositing logic, sharp/Blob/Prisma at the edges
Grouping (`variants.ts`) and the validation gate (`validate.ts`) are pure functions over plain data — fully unit-testable with no mocks. The route is the only place that touches sharp, `get`, `put`, and Prisma. This mirrors the Phase-5 `lib/orchestration/layers.ts` (pure mapping) ⟷ webhook-route split. [VERIFIED: codebase pattern]

### Anti-Patterns to Avoid
- **Overloading `group.ts`'s `variant` mode** — it is guarded by `test/out-gallery-group.test.ts` and is a gallery-presentation bucket, not the compositing unit. Add a new fn.
- **Compositing a remote URL** — sharp needs a Buffer; the worker's public `image_url` must not be used (SEC-02). Always `get(private)` → Buffer.
- **Silently flattening empty/mismatched layers** — COMP-02 mandates a WARN. Never skip the gate.
- **Flattening a whole batch in one synchronous route** — overruns 60s. One variant per request; cap lazy batch flattening.
- **Buffering all batch layers at once** — composite one variant, free its buffers, move on.
- **Holding the composite Buffer in the zip route** — zip repackages bytes via streams; never decode in the zip path.
- **Storing/serving the deliverable's public blob URL** — re-derive `/api/file?pathname=…` via `privateUrl()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Alpha-over compositing | Manual per-pixel blend | `sharp(base).composite([{input,blend:"over"}])` | Porter-Duff over, gamma, premultiplied alpha — libvips does it correctly and fast |
| Read image dims | Parse PNG/JPEG headers | `sharp(buf).metadata()` | Handles every format, orientation, channels |
| Detect empty/transparent layer | Scan pixels in JS | `sharp(buf).stats()` `channels[3]` / `isOpaque` | Single libvips pass; `.mean`/`.max` give coverage cheaply |
| Zip of N deliverables | Manual zip assembly | existing `ZipArchive` route | Already shipped + tested (`download/route.ts`) |
| Node→Web / Web→Node stream bridge | Custom pump | `Readable.fromWeb` / `Readable.toWeb` | Built-in; correct backpressure; already used |
| Private-blob delivery | New signed-URL scheme | `/api/file` proxy + `privateUrl()` | Private blobs have no signed-URL delivery (Pitfall 5) |
| Idempotent deliverable write | check-then-insert + manual blob versioning | `prisma.upsert` + `putPrivate({allowOverwrite:true})` | Race-free; overwrite-in-place |

**Key insight:** Phase 6 is almost entirely *orchestration of existing primitives* — sharp for the one genuinely new operation (composite), and otherwise the Phase-5 auth/blob/zip patterns verbatim. The only net-new code worth careful design is the variant grouping + validation gate (both pure, both unit-tested).

## Common Pitfalls

### Pitfall 1: Using `group.ts`'s `variant` as the compositing key
**What goes wrong:** Layers split by stone group / ignore angle → a "variant" holds only one pass → composite has no base or no overlays.
**How to avoid:** New `groupVariantsForCompositing` keyed on `${angleKey}:${metalKey}`, base = metal pass, overlays = all stone passes.
**Warning signs:** Deliverables that are just the metal with no stones, or one-stone-only images.

### Pitfall 2: sharp on a remote/public URL
**What goes wrong:** `sharp("https://…blob…")` is not a thing; and the worker URL is public → SEC-02 violation.
**How to avoid:** `get(pathname,{access:'private'})` → `Readable.fromWeb` → `Buffer.concat` → `sharp(buf)`.
**Warning signs:** Layer fetch 401/404; ESLint flags public URL construction (blob-guard test).

### Pitfall 3: Dimension drift between passes
**What goes wrong:** If a stone holdout recipe ever drifts to a different resolution, `composite` mis-aligns or sharp throws on extends.
**How to avoid:** The validation gate's `dimension-mismatch` check WARNs and blocks before compositing — never composite mismatched dims.
**Warning signs:** Deliverable with a clipped/offset stone; sharp "image to composite must have same dimensions or smaller" error.

### Pitfall 4: 60s overrun on whole-batch flatten
**What goes wrong:** Flattening every variant in one request exceeds maxDuration:60.
**How to avoid:** One variant per flatten request; batch download zips already-flattened deliverables and lazily flattens only a capped number of missing ones.
**Warning signs:** Vercel function timeout (504) on the flatten/zip route for large batches.

### Pitfall 5: JPEG has no alpha
**What goes wrong:** `.jpeg()` on a composite that still carries alpha produces a black/garbled background.
**How to avoid:** If JPEG output is chosen, `.flatten({ background: '#ffffff' })` before `.jpeg()`. Default to PNG to sidestep this.
**Warning signs:** Black backgrounds in JPEG deliverables.

### Pitfall 6: `Layer.jobId @unique` conflicts with multi-source deliverable
**What goes wrong:** A deliverable has no single jobId; an `upsert({where:{jobId}})` either can't key it or collides.
**How to avoid:** Option B synthetic jobId (`deliverable:<batchId>:<angle>:<metal>`) for no migration, OR Option A schema migration with deliverable columns + composite unique.
**Warning signs:** Prisma unique-constraint error on the second flatten of a variant.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 (verified package.json) |
| Config file | `vitest.config.*` + `test/setup.ts` (env loader + `fakeSession`/`testPrisma`) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |
| Mocking style | `vi.mock("@/lib/db/prisma")`, `vi.mock("@vercel/blob")`, `vi.mock("sharp")` (or real sharp on tiny fixture buffers); source guards via `readFileSync` (see `test/blob-guard.test.ts`, `test/orch-db-only.test.ts`) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| COMP-02 | `groupVariantsForCompositing` buckets layers by (angle×metal); base=metal pass; overlays=stone passes | unit (pure) | `npx vitest run test/comp-variant-group.test.ts` | ❌ Wave 0 |
| COMP-02 | z-order: base first, overlays sorted by (sortOrder, stoneGroup) deterministically | unit (pure) | `npx vitest run test/comp-zorder.test.ts` | ❌ Wave 0 |
| COMP-02 | `validateVariant`: missing-base / dimension-mismatch / empty-layer / no-overlays warnings from mock metadata+stats | unit (pure) | `npx vitest run test/comp-validate.test.ts` | ❌ Wave 0 |
| COMP-02 | gate PASS → composite produced; gate FAIL → `{ok:false, warnings}` and NO blob write / NO upsert | unit (mock sharp+blob+prisma) | `npx vitest run test/comp-flatten-route.test.ts` | ❌ Wave 0 |
| COMP-02 | flatten is idempotent (re-flatten upserts same row + overwrites blob) | unit (mock prisma+blob) | `npx vitest run test/comp-flatten-idempotent.test.ts` | ❌ Wave 0 |
| COMP-02 | flatten route requires session + IDOR-scopes batch by params.id | unit | `npx vitest run test/comp-flatten-auth.test.ts` | ❌ Wave 0 |
| COMP-03 | batch download zips only `isFlattened` deliverables; reads private only | unit (mock blob+prisma) | `npx vitest run test/comp-download-deliverables.test.ts` | ❌ Wave 0 |
| COMP-03 | single deliverable download via `/api/file?download=1` (already covered by `out-file-download`) | unit | `npx vitest run test/out-file-download.test.ts` | ✅ reuse |
| COMP-02 | flatten/route + compositing libs import no `@/lib/runpod` (DB-only-ish source guard) | source guard | extend `test/orch-db-only.test.ts` DB_ONLY_FILES | ✅ extend |
| COMP-02 | compositing/flatten constructs no public blob URL (uses get/put private) | source guard | extend `test/blob-guard.test.ts` | ✅ extend |

**Manual checks (cannot be unit-automated):**
- Real sharp composite on actual rendered metal+stone layers — verify stones land correctly over metal, no halo/fringe, alignment pixel-perfect (eyeball a known variant).
- JPEG-vs-PNG visual quality on a real diamond render (if JPEG option is enabled).
- Vercel deploy smoke: sharp linux binary loads; a per-variant flatten completes well under 60s.

### Sampling Rate
- **Per task commit:** `npx vitest run <the-touched-test-file>`
- **Per wave merge:** `npx vitest run` (full suite green)
- **Phase gate:** full suite green + one manual real-render flatten verified before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/comp-variant-group.test.ts` — (angle×metal) grouping
- [ ] `test/comp-zorder.test.ts` — deterministic overlay order
- [ ] `test/comp-validate.test.ts` — validation gate warnings
- [ ] `test/comp-flatten-route.test.ts` — gate PASS/FAIL → write/no-write
- [ ] `test/comp-flatten-idempotent.test.ts` — re-flatten upsert/overwrite
- [ ] `test/comp-flatten-auth.test.ts` — session + IDOR
- [ ] `test/comp-download-deliverables.test.ts` — batch zip of deliverables
- [ ] Extend `test/orch-db-only.test.ts` + `test/blob-guard.test.ts` guard lists
- [ ] Framework install: none (Vitest present)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireSession()` first line of flatten route + (reused) download routes |
| V4 Access Control | yes (IDOR) | Batch loaded by `params.id` via Prisma; variant layers derived from DB rows, never caller-supplied pathnames; single-tenant posture inherited from Phase 5 |
| V5 Input Validation | yes | Validate `angle`/`metal`/`scope`/`download`/`name` query params; sanitize the deliverable filename + blob pathname stem (strip CR/LF, quotes, path separators) |
| V6 Cryptography | no | No new crypto; private-blob access uses the existing token |
| V12 Files/Resources | yes | Path traversal in the deliverable pathname stem (`<angle>_<metal>`) — sanitize before `put`; sharp decodes untrusted-but-internal render bytes (libvips is the hardened decoder; inputs are our own renders, low risk) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via angle/metal in deliverable pathname | Tampering | Sanitize stem (same `sanitizeFilename` as download routes); derive keys from DB combos, not raw query |
| Arbitrary blob composite via guessed pathname | Information Disclosure | Layer set derived from DB rows under the IDOR-scoped batch, never from caller pathnames |
| Decompression bomb via crafted layer | DoS | Inputs are our own worker renders (trusted origin); cap per-request variant count + 60s budget; sharp/libvips has built-in pixel limits (`sharp({ limitInputPixels })`) |
| Unauthed flatten/download | Spoofing | `requireSession()` fail-closed on every route |

## State of the Art
| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy Flask renderer composited layers in Blender/Pillow at render time | Decoupled server-side `sharp` composite in the web layer over recorded Layer rows | This phase | Compositing is independent of the GPU worker; re-flatten without re-rendering |
| Pillow (Python) post-process compositing | sharp (Node/libvips) in the Next.js route | This phase | Same runtime as the rest of the web layer; no Python in the request path |
| `archiver("zip")` callable factory | `new ZipArchive()` (archiver 8 ESM named class) | archiver 8 | Already adopted in `download/route.ts`; reuse as-is |

## Assumptions Log
| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PNG is acceptable for the deliverable (vs literal JPEG) | sharp pipeline Step 4 | If JPEG mandatory, add `.flatten().jpeg()`; minor — both are one sharp call |
| A2 | Synthetic-jobId persistence (Option B) is acceptable, avoiding a schema migration | Persistence | If first-class deliverable columns are required, Option A migration is needed (heavier) |
| A3 | All passes for a variant share the same render resolution (so `composite` aligns at 0,0) | sharp pipeline Step 3 | If resolutions ever differ, the dimension gate WARNs and blocks — correctness preserved, just no auto-resize |
| A4 | Worker render outputs are private (`BLOB_ACCESS=private`) so `get(private)` finds layers | Runtime State Inventory | Inherited Phase-5 dependency; if public, flatten can't read layers |
| A5 | `empty-layer` (zero/near-zero alpha) should hard-block the flatten (per COMP-02 wording) | Validation gate | If product intentionally has an empty stone group, operator needs a `?force=1` escape (provided as advisory path) |
| A6 | `sharp` linux binary deploys correctly on Vercel for Node routes | Runtime State Inventory | Common gotcha; verify in deploy smoke, not a code blocker |

## Open Questions
1. **Deliverable format: PNG (recommended) or JPEG?** Surface in discuss-phase (mirrors Phase-5 metal-format question). Default PNG.
2. **Persistence: synthetic-jobId (Option B, no migration) vs first-class deliverable columns (Option A, migration)?** Recommend Option B unless deliverables need to be queried by angle/metal at SQL level.
3. **Whole-batch flatten for very large batches** — capped lazy flatten in the zip route is recommended; a true background/queued pre-flatten is out of scope (flag if batches exceed ~12 unflattened variants routinely).
4. **Metal-only products** (no stone passes) — flatten base-only via `?force=1` after the `no-overlays` advisory? Confirm desired behavior.
5. **Worker `BLOB_ACCESS=private` confirmed in deploy env?** (Inherited from Phase 5 A3) — blocks reading layers for compositing.

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| sharp | COMP-02 composite + validation | ✓ | 0.34.5 (verified resolvable) | none needed |
| archiver / ZipArchive | COMP-03 batch zip | ✓ | ^8.0.0 (in use) | — |
| @vercel/blob | private get + put | ✓ | ^2.4.0 | — |
| Prisma | load layers + upsert deliverable | ✓ | 6.19.2 | — |
| Vitest | tests | ✓ | ^4.1.8 | — |
| Node `Readable.fromWeb`/`toWeb` | stream↔buffer bridge | ✓ (Node 17+) | platform | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — Phase 6 installs nothing new.

## Sources
### Primary (HIGH confidence)
- Repo source read this session: `prisma/schema.prisma`, `lib/gallery/query.ts`, `lib/gallery/group.ts`, `app/(app)/batches/[id]/download/route.ts`, `app/api/file/route.ts`, `lib/orchestration/layers.ts`, `lib/orchestration/backfill-layers.ts`, `lib/blob.ts`, `lib/orchestration/dispatch.ts`, `workers/runpod-blender/handler.py`, `workers/runpod-blender/render_scene.py`, `package.json`, `.planning/REQUIREMENTS.md`, `.planning/config.json`, existing `test/out-*.test.ts`.
- `node -e "require('sharp/package.json').version"` → `0.34.5` (sharp resolvable in this environment).
- `node -e "Object.keys(require('@vercel/blob'))"` → confirms `get`, `put`, `head`, `presignUrl`, `issueSignedToken` exports for v2.4.
- `.planning/phases/05-outputs-gallery-layered-passes/05-RESEARCH.md` (format reference + inherited findings A3/SEC-02).

### Secondary (MEDIUM confidence)
- [CITED: sharp.pixelplumbing.com/api-composite] `.composite([{input, blend}])` z-order + `over` blend.
- [CITED: sharp.pixelplumbing.com/api-input#metadata] `.metadata()` → width/height/channels/hasAlpha.
- [CITED: sharp.pixelplumbing.com/api-input#stats] `.stats()` → per-channel stats + `isOpaque` (alpha via `channels[3]`).

### Tertiary (LOW confidence)
- sharp exact API field names (`channels[3].mean` as alpha proxy) — verify against installed 0.34.5 with a tiny RGBA fixture in the first Wave-0 test before relying on it.

## Metadata
**Confidence breakdown:**
- Stack (sharp/archiver present): HIGH — both verified installed/used; nothing to install.
- Compositing variant key + z-order: HIGH — derived directly from `group.ts` + `enterprise-recipes` pass model read this session.
- sharp API surface: MEDIUM — composite/metadata/stats are stable and well-documented, but exact `stats()` alpha field should be fixture-verified in Wave 0.
- Persistence option: MEDIUM — two viable paths; planner/discuss-phase must pick (jobId @unique conflict is real, verified in schema).
- Auth/zip/delivery: HIGH — verbatim reuse of shipped, tested Phase-5 routes.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable repo; re-verify sharp `stats()` alpha field with a fixture at implementation time)
