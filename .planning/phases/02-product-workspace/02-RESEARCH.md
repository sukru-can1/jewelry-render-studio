# Phase 2: Product Workspace — Research

**Researched:** 2026-06-05
**Domain:** Next.js 15 App Router product CRUD (Server Components + Server Actions + Prisma 6), authenticated direct-to-Blob client upload (`@vercel/blob/client`), RunPod `inspect_materials` dispatch + status + inventory parse, object→group assignment data model, Admin-editable domain settings (DATA-04)
**Confidence:** HIGH — every reused primitive (Prisma schema, `requireRole`, blob upload token route, `/api/file` proxy, `lib/runpod.ts`, `inspect_materials.py` output) read directly from the live tree this session; `@vercel/blob/client` `upload()` signature + `access:'private'` support re-verified against current Vercel docs (2026-03-27).

---

## Summary

Phase 2 builds the **Product Workspace** entirely on top of the Phase-1 foundation. Nothing in the render pipeline is rebuilt and no new external service is introduced: every capability is a thin orchestration layer over primitives that already exist in the tree — the Prisma `Product` / `ObjectGroupAssignment` / domain-settings models (already migrated), `requireSession()` / `requireRole()` (the RBAC boundary), the hardened `POST /api/blob/upload` client-upload token route, the authed `GET /api/file` private-blob proxy, `submitRunPod()` / `getRunPodStatus()`, and the `inspect_materials.py` worker operation whose JSON shape is fixed and read this session.

The dominant architectural pattern for this phase is **Next.js 15 Server Components for reads + Server Actions for mutations**, mirroring exactly how Phase 1 already does data-loading (`app/(app)/admin/settings/page.tsx` reads via `prisma.*.findMany` in an `async` server component) and mutations (the `/api/admin/users` route + client dialog `fetch`). Phase 2 has a free choice between **route handlers** (Phase 1's user-admin style) and **Server Actions** for its mutations; this research recommends **Server Actions** for product create / assignment save / settings save (co-located, typed, `revalidatePath` instead of client `router.refresh()`), while keeping the **client-upload token route** as a route handler (it must be — `handleUpload` needs a real `Request`).

Three findings materially shape the plan and are called out below: (1) the existing upload token route does **not** yet return `access:'private'`, so model uploads currently land in **public** Blob unless Phase 2 fixes both the client `upload()` call and the token route; (2) `inspect_materials.py` returns **ALL** scene objects/materials (including non-mesh `EMPTY`/camera/light nodes and the imported model's own materials) — the inventory viewer and group-assignment surface must filter to `type==="MESH"` and the assignment "objects" are the meshes; (3) the seed (`prisma/seed.ts`) **does not seed `StoneType`** — DATA-04's "stone types" editor must ship a seed + CRUD or it edits an empty table.

**Primary recommendation:** Build in this order — **(0)** fix the upload token route to mint **private** tokens + add a dedicated `Inspection` model (recommended over overloading `Job`) → **(A)** Product CRUD + private model upload (PROD-01) → **(B)** Inspection dispatch + **poll** status via `getRunPodStatus` + parse/persist inventory (PROD-02) → **(C)** object→group assignment save/load with token-assist (PROD-03/04) → **(D)** products list + reopen (PROD-05) → **(E)** Admin settings edit incl. StoneType seed/CRUD (DATA-04). Use **Server Actions** for mutations, **Server Components** for reads, **zod 3.25** (already installed) for every payload, and the **existing** Vitest harness (`test/setup.ts`, `test/factories.ts`, prisma/runpod mocking exactly as `test/user-admin.test.ts` does).

---

<user_constraints>
## User Constraints

**No `*-CONTEXT.md` exists for Phase 2** (no `/gsd:discuss-phase` was run — `.planning/phases/02-product-workspace/` contains only `02-UI-SPEC.md`). The constraints below are the **locked decisions** carried forward from PROJECT.md Key Decisions, STATE.md Accumulated Decisions, the Phase-1 RESEARCH locked stack, and the approved `02-UI-SPEC.md`. The planner MUST honor these as if they were CONTEXT.md decisions.

### Locked Decisions (carried forward)
- **Stack is frozen:** Next.js 15 App Router + React 19 + TypeScript; Prisma **6.19.2** (`@prisma/client@6.19.2`, never `@latest`=7); `next-auth@5.0.0-beta.31`; `@vercel/blob@^2.4.0`; `zod@^3.25.76`; `bcryptjs@^3.0.3`. **Do NOT add new runtime dependencies** unless a `must_cover` item genuinely requires one — every Phase-2 capability is achievable with what `package.json` already lists.
- **Reuse, don't rebuild:** the RunPod worker (`workers/runpod-blender/*`), `lib/runpod.ts`, `lib/enterprise-recipes.ts`, the Prisma schema, `lib/auth/rbac.ts`, the blob upload token route, and `GET /api/file` proxy are reused untouched **except** the one required hardening fix (private upload tokens) noted below.
- **RBAC is server-side and fail-closed:** every mutation/route calls `requireSession()` (Operator-or-Admin actions) or `requireRole("Admin")` (settings/StoneType edits) as its FIRST line. UI hiding is never the boundary (AUTH-05).
- **New Blob writes are private (SEC-02):** model uploads must use a **private** store and be delivered via the `GET /api/file?pathname=…` proxy. There are NO signed/time-limited URLs for private blobs (Phase-1 RESEARCH Pitfall 5).
- **Postgres is the system of record:** structured product/assignment/inspection state lives in Postgres via Prisma, NOT in Blob JSON. Only binaries (the model file, the `material_inventory.json` sidecar) live in Blob.
- **Domain fidelity (DATA-04):** the seeded camera views / metals / groups / quality presets are the rendering team's real values (already seeded, exact values in `prisma/seed.ts`); editing must preserve them and changes apply to **new** batches only (Phase 3 reads them) — not retroactive.
- **UI contract:** `02-UI-SPEC.md` (status: approved) is the binding visual/interaction contract for all five surfaces. shadcn/ui new-york + teal accent (NO purple); the net-new components and the five surfaces are enumerated there. Group-chip colors: alloycolour=neutral, diamond=teal(accent), stone2=info, stone3=warning, unassigned=dashed-neutral.

### Claude's Discretion
- **Mutations via Server Actions vs. route handlers** — both valid; this research **recommends Server Actions** for product-create / assignment-save / settings-save, keeping route handlers only where required (upload token route). The planner may choose route handlers to mirror Phase-1 user-admin exactly if it prefers consistency over co-location.
- **Inspection persistence shape** — dedicated `Inspection` model (recommended) vs. reuse `Job`. Recommendation + rationale in PROD-02 below.
- **Inventory storage** — JSON column on the product/inspection (recommended) vs. normalized object/material tables. Recommendation in PROD-02.
- **Inspection status mechanism** — **poll `getRunPodStatus` on demand** (recommended for Phase 2; does NOT block on the Phase-4 webhook) vs. reuse the scaffolded webhook. Recommendation + rationale in PROD-02.
- **New product entry** — dedicated `/products/new` route vs. dialog from the list (UI-SPEC allows either).

### Deferred Ideas (OUT OF SCOPE for Phase 2)
- **PROD-04 full use** (assignments actually driving holdout include/exclude tokens in generated recipes) → **Phase 3** (Batch Builder). Phase 2 only persists the assignment data and proves the linkage shape that `lib/enterprise-recipes.ts` will consume. Do NOT build recipe generation here.
- **Batch builder, orchestration, gallery, compositing** → Phases 3–6.
- **RunPod webhook reconcile / Vercel Cron** → Phase 4 (the webhook handler is a Phase-1 scaffold; Phase 2 does not wire it).
- **DATA-05 history migration** + **SEC-05 hardcoded-ring99 removal** → Phase 8.
- **Re-uploading legacy public blobs as private** → Phase 8 (accept-as-burned policy from Phase 1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROD-01 | Operator creates a product + uploads its 3D model (GLB/FBX/BLEND/OBJ/STL) via direct-to-Blob client upload | "PROD-01" section — `upload()` from `@vercel/blob/client` with `access:'private'` + the (to-be-fixed) token route; persist `Product.modelUrl`/`modelFormat`/`status` via Server Action |
| PROD-02 | Operator runs material inspection and sees detected objects, material slots, BSDF | "PROD-02" — dispatch `submitRunPod({operation:'inspect_materials', model})`; recommend dedicated `Inspection` model + **poll** `getRunPodStatus`; parse `inspect_materials.py` output (`objects[]`, `materials[]`, `principled{}`) into a JSON column |
| PROD-03 | Operator assigns each detected object to a group and saves to the product | "PROD-03/04" — persist `ObjectGroupAssignment` (one row per group, `objectTokens: String[]`); token-assist suggestions from object names; Server Action save + `revalidatePath` |
| PROD-04 | Saved assignment drives which objects render/held-out per pass | "PROD-03/04" — the data linkage: `objectTokens` become `material_map`/holdout `contains` tokens consumed by `lib/enterprise-recipes.ts` in Phase 3. Phase 2 = persist the shape only |
| PROD-05 | Operator browses + reopens previously created products | "PROD-05" — Server Component `prisma.product.findMany` → product-card grid; `/products/[id]` detail re-loads product + inspection + assignments |
| DATA-04 | Admin views + edits domain settings; changes apply to new batches | "DATA-04" — make CameraView/Metal/StoneType/QualityPreset editable behind `requireRole("Admin")`; zod-validated Server Actions; **seed + CRUD StoneType** (not seeded in Phase 1) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Product create / rename / status persist | API/Backend (Server Action, Node runtime) | Database (Prisma) | `requireSession()` + `prisma.product.create`; co-located with the form |
| Large model upload (50MB GLB/FBX/BLEND/OBJ/STL) | Browser/Client (`upload()` direct to Blob) | API/Backend (token route mints **private** token) | Files > 4.5MB MUST bypass the Vercel function body limit → direct-to-Blob; server only authorizes + mints the token |
| Private model delivery (thumbnail/replace) | API/Backend (`GET /api/file` proxy) | Database (URL/pathname ref on Product) | SEC-02: private blobs streamed through the authed proxy, never a public URL |
| Inspection dispatch | API/Backend (Server Action → `submitRunPod`) | GPU worker (RunPod `inspect_materials`) | Web layer never inspects locally; it dispatches + records the RunPod job id |
| Inspection status | API/Backend (on-demand `getRunPodStatus` poll) | — | Phase-2 simple model: poll when the operator views the product; webhook is Phase 4 and must NOT block this |
| Inventory parse + persist | API/Backend (fetch `material_inventory.json` → store JSON) | Blob (sidecar) + Database (JSON column) | Parse the worker's fixed JSON shape server-side; persist a queryable JSON snapshot |
| Object→group assignment save/load | API/Backend (Server Action) | Database (`ObjectGroupAssignment`) | `requireSession()`; upsert grouped `objectTokens[]` per product |
| Token-assist suggestions | Browser/Client (pure string match over object names) | — | Deterministic substring heuristics; operator Accepts (never auto-applied) |
| Products list + reopen | Frontend Server (async Server Component read) | Database (Prisma) | Read path mirrors `admin/settings/page.tsx` exactly |
| Domain settings edit | API/Backend (Server Action, `requireRole("Admin")`) | Database (Prisma upsert) | Admin-only; zod-validated; changes apply to new batches only |
| StoneType seed + CRUD | Database (seed) + API/Backend (Admin Server Action) | — | Table is currently unseeded; needs initial rows + edit surface |

---

## Standard Stack

**No new runtime dependencies are required for Phase 2.** Every capability is built from libraries already in `package.json` (read this session). This is the correct outcome — Phase 2 is an orchestration/UX layer over Phase-1 primitives.

### Core (all already installed — versions from live `package.json`)
| Library | Version (installed) | Purpose in Phase 2 | Why standard |
|---------|--------------------|--------------------|--------------|
| `next` | `^15.1.4` | App Router Server Components (reads) + Server Actions (mutations) + route handlers (upload token) | Native data layer; no extra fetch/RPC library needed [VERIFIED: package.json] |
| `@prisma/client` / `prisma` | `6.19.2` (pinned) | All product/assignment/inspection/settings persistence | System of record; Phase-1 singleton `lib/db/prisma.ts` [VERIFIED: package.json, prisma/schema.prisma] |
| `@vercel/blob` | `^2.4.0` | `upload()` (client) for the model; `get()` in the existing proxy for delivery | Private client-upload with `access:'private'` requires ≥2.3; 2.4 installed [VERIFIED: package.json] [CITED: vercel.com/docs/vercel-blob/client-upload] |
| `next-auth` | `5.0.0-beta.31` | `auth()` behind `requireSession`/`requireRole` in every action | RBAC boundary [VERIFIED: package.json] |
| `zod` | `^3.25.76` | Validate product-create, assignment-save, settings payloads | Already the validation lib (`lib/validation/user.ts` pattern); v3 NOT v4 [VERIFIED: package.json] |

### Supporting (already installed — UI + forms)
| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `react-hook-form` + `@hookform/resolvers` | `^7.77.0` / `^5.4.0` | Settings + assignment forms with zod resolver | Multi-field editable grids (camera views, quality presets) [VERIFIED: package.json] |
| `sonner` | `^2.0.7` | "Groups saved." / "Changes saved." toasts | UI-SPEC copy contract [VERIFIED: package.json] |
| `shadcn` (CLI) | `^4.10.0` | Add `progress collapsible accordion tabs radio-group checkbox popover command` (UI-SPEC §New components) | `npx shadcn@latest add …` — official registry only [VERIFIED: package.json, 02-UI-SPEC.md] |
| `lucide-react` | `^0.468.0` | Icons (dropzone cloud-upload, status, chevrons) | Inherited [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Actions for mutations | Route handlers (Phase-1 user-admin style) | Route handlers are more verbose (manual `fetch` + `router.refresh()`) but exactly match the one CRUD pattern already in the tree. Server Actions are co-located + use `revalidatePath`. **Recommend Server Actions**; either is acceptable. |
| Poll `getRunPodStatus` for inspection | Reuse the Phase-1 webhook scaffold | Webhook is Phase-4 scope (reconcile + Cron). Wiring it for inspection now couples Phase 2 to deferred work and needs a public callback URL in dev. **Poll** is simpler and self-contained. |
| JSON column for inventory | Normalized `InspectedObject` / `InspectedMaterial` tables | Normalization buys queryability nobody needs in Phase 2 and adds migration + write complexity. The inventory is read whole, rendered whole. **Recommend JSON column** (`Inspection.inventory Json`). |
| Dedicated `Inspection` model | Overload `Job` (status, runpodJobId) | `Job` belongs to a `Batch` (`batchId` is required, non-null in schema) — an inspection has no batch. Forcing it in pollutes the render-job table. **Recommend a small `Inspection` model.** |

**Installation (UI components only — no runtime deps):**
```bash
npx shadcn@latest add progress collapsible accordion tabs radio-group checkbox popover command
```

**Version verification (this session, from the live tree — no registry drift to chase):** all Phase-2 libraries are already pinned/installed in `package.json`. No `npm view` needed because nothing new is added. The only registry-sensitive items (`@vercel/blob` private client-upload, Prisma 6 vs 7) were settled in Phase-1 RESEARCH and the installed versions (`@vercel/blob ^2.4.0`, `prisma 6.19.2`) satisfy them.

## Package Legitimacy Audit

**No external packages are installed in Phase 2.** The only additions are **official shadcn/ui registry blocks** (`progress`, `collapsible`, `accordion`, `tabs`, `radio-group`, `checkbox`, `popover`, `command`) added via `npx shadcn@latest add` — these copy first-party Radix-based component source into `app/components/ui`, they are not npm dependencies. Per `02-UI-SPEC.md` "Registry Safety": official shadcn registry only, no third-party registries, no vetting gate required.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none — no new npm deps) | — | N/A |
| shadcn blocks (progress/collapsible/accordion/tabs/radio-group/checkbox/popover/command) | shadcn official registry (source copy, not a dep) | Approved (UI-SPEC §Registry Safety: PASS) |

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages added).
**Packages flagged as suspicious [SUS]:** none.

*slopcheck not run because Phase 2 installs zero npm packages. Radix primitives (`radix-ui ^1.4.3`) backing the shadcn blocks are already a Phase-1 dependency.*

---

## Architecture Patterns

### System Architecture Diagram (Phase-2 slice)

```
Browser (operator)
  │
  │ 1. New product: enter name → drag model file
  ▼
[Model dropzone (client component)]
  │  upload(file.name, file, {access:'private', handleUploadUrl:'/api/blob/upload', onUploadProgress})
  │        │
  │        └─►[POST /api/blob/upload]  onBeforeGenerateToken: requireSession()  ──► mints PRIVATE client token
  │                                     (FIX: must return access:'private' + addRandomSuffix)
  │        ◄── token ── then file streams DIRECTLY browser→Vercel Blob (bypasses 4.5MB fn body limit)
  │  returns { url, pathname, contentType }
  ▼
[Server Action: createProduct(name, blobPathname, format)]  requireSession()
  │  prisma.product.create({ name, modelUrl: pathname, modelFormat, status:'needs_inspection' })
  ▼ redirect → /products/[id]
─────────────────────────────────────────────────────────────────────────────
[/products/[id]  Server Component]  requireSession()
  │  prisma.product.findUnique(include:{assignments}) + prisma.inspection.findFirst
  │  thumbnail/model delivered via  GET /api/file?pathname=<modelUrl>  (authed proxy)
  │
  ├─ "Inspect materials" ─►[Server Action: startInspection(productId)] requireSession()
  │      submitRunPod({ operation:'inspect_materials', model:<signed-or-proxy model URL> })
  │      prisma.inspection.create({ productId, runpodJobId, status:'in_queue' })
  │
  ├─ status refresh ─►[Server Action / route: pollInspection(id)] getRunPodStatus(runpodJobId)
  │      on COMPLETED: fetch material_inventory.json (Blob) → prisma.inspection.update({inventory, status:'completed'})
  │      product.status → 'needs_groups'
  │
  └─ "Groups" tab ─►[Server Action: saveAssignments(productId, {group → objectTokens[]})] requireSession()
         upsert ObjectGroupAssignment rows; product.status → 'ready' when required groups covered
─────────────────────────────────────────────────────────────────────────────
[/admin/settings  Server Component]  requireRole("Admin")   (Operator → /forbidden)
  │  editable forms (react-hook-form + zod)
  └─ "Save changes" ─►[Server Action: saveDomainSettings(...)] requireRole("Admin")
         prisma.cameraView/metal/stoneType/qualityPreset.update  → revalidatePath('/admin/settings')
         (changes apply to NEW batches — Phase 3 reads them)
```

### Recommended Project Structure (additions only — extend, do not restructure)

```
prisma/
├── schema.prisma                    ★ ADD model Inspection (productId, runpodJobId, status, inventory Json?, error?, createdAt)
│                                       + Product.status string values convention (needs_inspection|inspecting|needs_groups|ready|inspection_failed)
├── migrations/                      ★ new migration for Inspection (migrate dev)
└── seed.ts                          ★ ADD stoneTypes[] seed (currently absent) — see DATA-04
lib/
├── products/
│   ├── actions.ts                   ★ "use server" — createProduct, renameProduct, replaceModel, saveAssignments
│   └── inspection.ts                ★ "use server" — startInspection, pollInspection, parseInventory()
├── settings/
│   └── actions.ts                   ★ "use server" — saveCameraViews, saveMetals, saveStoneTypes, saveQualityPresets (requireRole Admin)
├── validation/
│   ├── product.ts                   ★ zod: createProductSchema, assignmentSchema (group enum + tokens)
│   └── settings.ts                  ★ zod: cameraViewSchema (focal>0, fstop 0.7..32, el -90..90, az -180..180), metalSchema (hex), qualitySchema
├── inventory.ts                     ★ types + parser for inspect_materials.py output (MESH filter, BSDF extraction)
├── tokens.ts                        ★ token-assist heuristics (band/metal/prong→alloycolour, center/solitaire/diamond→diamond, round_/side→stone2/3)
└── (existing) runpod.ts, blob.ts, db/prisma.ts, auth/rbac.ts
app/(app)/
├── products/
│   ├── page.tsx                     ★ list (Server Component) — product-card grid (PROD-05)
│   ├── new/page.tsx                 ★ create form + dropzone (PROD-01)  [or dialog from list]
│   ├── [id]/page.tsx                ★ detail w/ tabs Overview|Materials|Groups (PROD-02/03)
│   ├── model-dropzone.tsx           ★ client — upload() w/ progress
│   ├── inventory-viewer.tsx         ★ client — collapsible per-object BSDF table
│   └── group-assignment.tsx         ★ client — radio-group per object + token-assist + sticky save
└── admin/settings/
    ├── page.tsx                     ★ UPGRADE Phase-1 read-only → editable (server) (DATA-04)
    └── settings-forms.tsx           ★ client — react-hook-form editable grids + sticky save
app/api/blob/upload/route.ts         ★ FIX onBeforeGenerateToken to return access:'private'
test/
├── product-create.test.ts          ★ createProduct action (mock prisma + requireSession)
├── product-upload-token.test.ts    ★ upload token route: unauth→401, returns access:'private'
├── inspection-dispatch.test.ts     ★ startInspection submits correct RunPod input; pollInspection parses inventory
├── inventory-parser.test.ts        ★ parseInventory() over a fixture of inspect_materials.py JSON (MESH filter, BSDF)
├── assignment-save.test.ts         ★ saveAssignments upsert + load round-trip
└── settings-edit.test.ts           ★ Admin saves settings (200); Operator → 403; zod rejects bad focal/hex
```

### Pattern 1: Authenticated direct-to-Blob client upload, PRIVATE (PROD-01) — the load-bearing one

**What:** Files up to ~50MB cannot go through a Vercel function (4.5MB request-body limit). The browser calls `upload()` from `@vercel/blob/client`, which does a token exchange with `POST /api/blob/upload` (the existing, Phase-1-hardened route) and then streams the file **directly browser→Blob**. The token route authorizes via `requireSession()` and must mint a **private** token.

**When to use:** Always for the model file (PROD-01). Never for small JSON (that goes through a Server Action).

**Client (new `model-dropzone.tsx`):**
```tsx
// Source: vercel.com/docs/vercel-blob/client-upload (verified 2026-03-27)
"use client";
import { upload } from "@vercel/blob/client";

const result = await upload(file.name, file, {
  access: "private",                  // ← REQUIRED — without it the blob is PUBLIC (SEC-02 violation)
  handleUploadUrl: "/api/blob/upload",
  contentType: file.type || "application/octet-stream",
  // multipart: true,                 // optional for very large files; 50MB is fine single-part
  onUploadProgress: ({ percentage }) => setProgress(percentage),
});
// result.url (proxy-style), result.pathname  ← persist result.pathname on the Product
```

**Server (existing `app/api/blob/upload/route.ts` — REQUIRED FIX):** the current `onBeforeGenerateToken` returns `{ allowedContentTypes, addRandomSuffix, tokenPayload }` but **omits `access`** — so Vercel defaults the token to `public`. Phase 2 must add `access: "private"`:
```ts
onBeforeGenerateToken: async (pathname) => {
  await requireSession();                       // unchanged auth boundary
  return {
    access: "private",                          // ★ ADD THIS (SEC-02)
    allowedContentTypes,                        // keep restricted model/image/json set
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({ pathname }),
  };
},
```
After upload, persist `result.pathname` to `Product.modelUrl` and deliver later via `GET /api/file?pathname=<modelUrl>` (the existing proxy). **Do NOT store or render `result.url` as a public link.**

[CITED: vercel.com/docs/vercel-blob/client-upload — `upload(pathname, file, {access, handleUploadUrl, onUploadProgress})`; `access` settable in client upload via `onBeforeGenerateToken`] [VERIFIED: app/api/blob/upload/route.ts read this session — `access` currently absent]

### Pattern 2: Server Action mutation + zod + revalidate (product create, assignment save, settings save)

**What:** A `"use server"` function that runs `requireSession()`/`requireRole()` first, validates with zod, writes via Prisma, then `revalidatePath()`. Replaces the Phase-1 `fetch` + `router.refresh()` dance with co-located typed mutations.

**Example (product create):**
```ts
// lib/products/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { createProductSchema } from "@/lib/validation/product";

export async function createProduct(input: unknown) {
  await requireSession();                                  // fail-closed first line
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.flatten() };
  const { name, modelPathname, modelFormat } = parsed.data;
  const product = await prisma.product.create({
    data: { name, modelUrl: modelPathname, modelFormat, status: "needs_inspection" },
  });
  revalidatePath("/products");
  redirect(`/products/${product.id}`);
}
```
**Note:** Server Actions that throw a `Response` (from `requireRole`) need the same `instanceof Response` handling Phase-1 routes use — OR return a typed error object and let the action's caller render it. For Admin settings, prefer `requireRole("Admin")` then `try/catch` mapping 403 → a returned `{ ok:false, forbidden:true }` (the page-level `requireRole` already redirects Operators to `/forbidden`, so the action is defense-in-depth).
[CITED: nextjs.org App Router Server Actions; mirrors lib/auth/rbac.ts + app/(app)/admin/settings/page.tsx read this session]

### Pattern 3: Inspection dispatch + poll (PROD-02)

**What:** Dispatch the existing RunPod `inspect_materials` operation, record a row, and refresh status by polling `getRunPodStatus` when the operator views the product — no webhook dependency.

**Dispatch:**
```ts
// lib/products/inspection.ts  "use server"
import { submitRunPod, getRunPodStatus } from "@/lib/runpod";
// model must be reachable by the worker — pass a URL the RunPod worker can GET.
// The worker downloads the model (handler.py). Use the private-blob delivery URL
// the worker is authorized for, OR a freshly-put public-read-once path — confirm
// worker auth model (Open Question 1).
const res = await submitRunPod({ operation: "inspect_materials", model: modelUrlForWorker });
await prisma.inspection.create({
  data: { productId, runpodJobId: res.id, status: "in_queue" },
});
```

**Poll + parse:**
```ts
const status = await getRunPodStatus(inspection.runpodJobId);   // {status, output}
if (status.status === "COMPLETED") {
  const inventory = await parseInventory(status.output);        // see Pattern 4
  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { status: "completed", inventory },
  });
}
```
**RunPod input shape:** `submitRunPod(input)` wraps `input` as `{ input }` to `POST /run`. The worker's `handler.py` reads `operation` and `model`; `inspect_materials.py` writes `material_inventory.json` and uploads it to Blob. The status `output` carries the inventory URL/data — **confirm the exact `output` field the handler returns for the inspect path (Open Question 2)** by reading `handler.py`'s inspect branch at plan time.
[VERIFIED: lib/runpod.ts, workers/runpod-blender/inspect_materials.py read this session]

### Pattern 4: Parse `inspect_materials.py` output (the fixed shape)

**What:** `inspect_materials.py` emits a single JSON object. Read this session, the exact shape is:
```jsonc
{
  "source": "<model path>",
  "objects": [
    { "name": "band_metal", "type": "MESH",
      "material_slots": ["Gold", null],
      "children": ["..."], "hide_render": false, "hide_viewport": false, "visible_get": true,
      "bounds": { "min":[...], "max":[...], "size":[...], "max_dimension": 12.3 } }   // MESH only
    // NOTE: also includes EMPTY / CAMERA / LIGHT objects with NO "bounds"
  ],
  "materials": [
    { "name": "Gold", "use_nodes": true, "diffuse_color": [r,g,b,a],
      "principled": { "Base Color": [r,g,b,a], "Metallic": 1.0, "Roughness": 0.2,
                      "Transmission Weight": 0.0, "IOR": 1.45 /* socket names vary by Blender ver */ },
      "nodes": [ ... ] }
  ]
}
```
**Parser rules (`lib/inventory.ts`):**
- The **assignable objects** = `objects.filter(o => o.type === "MESH")`. Non-mesh nodes (empties/cameras/lights) are NOT render targets and must not appear in the group-assignment table.
- BSDF values live under `materials[].principled{}`; **socket names are Blender-version-dependent** (e.g. "Transmission" vs "Transmission Weight"); read defensively (lookup by includes/normalized key), don't hard-require a fixed key set. The UI-SPEC asks for Base Color (RGBA swatch), Metallic, Roughness, Transmission, IOR — extract what's present, render "—" for absent.
- `object_signature` for token-assist = lowercased `"<name> <space-joined material_slots>"` (matches the worker's render-time `object_signature` convention in `render_scene.py`), so suggestions align with what the recipe builder will later match.
[VERIFIED: workers/runpod-blender/inspect_materials.py — `object_summary` / `material_summary` read this session]

### Pattern 5: Object→group assignment persistence (PROD-03/04)

**What:** The schema already has `ObjectGroupAssignment { productId, group String, objectTokens String[] }`. The natural shape is **one row per group**, `objectTokens[]` = the object names (or signatures) assigned to that group. Saving = delete-and-recreate (or upsert) the product's assignment rows inside a transaction.

**Why this shape feeds PROD-04:** In Phase 3, `lib/enterprise-recipes.ts` builds per-pass recipes by deciding which objects are visible vs. held out. The `objectTokens[]` for `alloycolour` become the `contains` tokens kept visible in the metal pass; `diamond`/`stone2`/`stone3` tokens drive their holdout PNG passes. Phase 2 persists exactly these token lists so Phase 3 reads them directly into `material_map`/visibility — **Phase 2 does not generate recipes** (deferred).

**Save (Server Action):**
```ts
// groups: { alloycolour: string[], diamond: string[], stone2: string[], stone3: string[] }
await prisma.$transaction([
  prisma.objectGroupAssignment.deleteMany({ where: { productId } }),
  prisma.objectGroupAssignment.createMany({
    data: Object.entries(groups)
      .filter(([, tokens]) => tokens.length)
      .map(([group, objectTokens]) => ({ productId, group, objectTokens })),
  }),
]);
// recompute Product.status: 'ready' if required groups covered, else 'needs_groups'
```
[VERIFIED: prisma/schema.prisma ObjectGroupAssignment + render_scene.py object_signature convention]

### Pattern 6: Token-assist heuristics (PROD-03 UX)

```ts
// lib/tokens.ts — deterministic, operator Accepts; never auto-applied
const RULES: { group: string; contains: string[] }[] = [
  { group: "alloycolour", contains: ["metal", "band", "prong", "shank", "alloy"] },
  { group: "diamond",     contains: ["center", "solitaire", "diamond", "main", "round_5", "round_6"] },
  { group: "stone2",      contains: ["side", "round_", "stone2", "halo"] },
  { group: "stone3",      contains: ["accent", "stone3", "pave", "melee"] },
];
export function suggestGroup(signature: string): string | null {
  const s = signature.toLowerCase();
  for (const r of RULES) if (r.contains.some(t => s.includes(t))) return r.group;
  return null;
}
```
[CITED: CLAUDE.md material-system name patterns (`metal_*`, `band_*`, `prong_*`) + render_scene.py object_signature]

### Anti-Patterns to Avoid
- **Uploading the model through a Server Action / route body** → hits the 4.5MB Vercel limit; must use client `upload()` direct-to-Blob.
- **Omitting `access:'private'` in the client `upload()` AND the token route** → model lands in public Blob (SEC-02 regression). Both sides must set it.
- **Persisting `result.url` and rendering it as an `<img src>`/link** → that's the (non-)public URL path; always go through `GET /api/file?pathname=…`.
- **Overloading `Job` for inspections** → `Job.batchId` is required; an inspection has no batch. Use a dedicated `Inspection` model.
- **Wiring the Phase-4 webhook for inspection status** → couples to deferred work + needs a public callback in dev. Poll instead.
- **Hard-requiring fixed BSDF socket keys** → Blender version drift renames sockets; read defensively.
- **Including non-MESH objects in the assignment table** → empties/cameras/lights are not render targets.
- **Settings edit without `requireRole("Admin")` in the action** → page-level redirect is not the server boundary; the action must re-check (AUTH-05).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Large-file upload past 4.5MB | Custom chunked multipart to your own route | `@vercel/blob/client` `upload()` direct-to-Blob | Token exchange + direct stream is the supported path; your route can't receive 50MB |
| Private asset delivery | Signed-URL scheme over public Blob | Existing `GET /api/file` proxy + `access:'private'` | No signed-URL API for private blobs (Phase-1 Pitfall 5); proxy already built |
| Material inspection | Re-implement Blender introspection | Existing RunPod `inspect_materials` op | Worker + `inspect_materials.py` already extract objects/slots/BSDF |
| Mutation plumbing | Hand-rolled REST + client state sync | Next.js Server Actions + `revalidatePath` | Co-located, typed, no manual cache invalidation |
| Payload validation | Manual `if (!body.x)` checks | `zod` schemas (`lib/validation/*`) | Already the project convention (`lib/validation/user.ts`) |
| RBAC checks | Inline `if (role==='Admin')` | `requireRole("Admin")` / `requireSession()` | Single fail-closed boundary (AUTH-05) |
| Status tracking | Custom polling loop infra | `getRunPodStatus` on view + a status string column | Inspection is short (<1 min); on-demand poll suffices |

**Key insight:** Phase 2 adds **zero** new infrastructure. Every "hard" problem (big uploads, private delivery, Blender introspection, auth, validation) already has a blessed solution wired in Phase 1. The Phase-2 work is composition + UX, not new plumbing.

---

## Common Pitfalls

### Pitfall 1: Model upload silently lands in PUBLIC Blob
**What goes wrong:** `upload()` without `access:'private'` (and the token route without it) writes a public blob — recipes/models leak by URL (SEC-02 regression).
**Why:** `access` defaults to `public`; the current token route omits it.
**Avoid:** set `access:'private'` on BOTH the client `upload()` call and the route's `onBeforeGenerateToken` return; deliver only via `/api/file`.
**Warning signs:** `result.url` resolves without auth in an incognito window.

### Pitfall 2: `onUploadCompleted` doesn't fire locally
**What goes wrong:** Relying on the upload route's `onUploadCompleted` to write the Product DB row fails in local dev (Vercel can't call localhost).
**Why:** the completion webhook needs a public callback URL.
**Avoid:** persist the Product via the **client-driven Server Action** after `upload()` resolves (the recommended flow above), NOT in `onUploadCompleted`. Treat `onUploadCompleted` as best-effort logging only (as the existing route does).
**Warning signs:** products created in prod but not in `next dev`.

### Pitfall 3: Inspection has no `Batch` to attach to
**What goes wrong:** Trying to record the inspect job as a `Job` fails — `Job.batchId` is required.
**Avoid:** dedicated `Inspection` model (`productId`, `runpodJobId`, `status`, `inventory Json?`, `error?`).
**Warning signs:** needing to invent a fake batch just to log an inspection.

### Pitfall 4: BSDF socket name drift
**What goes wrong:** Inventory viewer shows blanks because it looks for "Transmission" but Blender emitted "Transmission Weight" (or IOR socket moved).
**Avoid:** read `principled{}` keys defensively (normalized/`includes` match); render present values, "—" for absent.
**Warning signs:** all-blank BSDF columns on a model that clearly has glass/metal.

### Pitfall 5: Non-MESH objects pollute the assignment table
**What goes wrong:** Empties/cameras/lights from the import show up as assignable "objects."
**Avoid:** filter `type === "MESH"` in the parser; only meshes are render targets.

### Pitfall 6: StoneType editor edits an empty table
**What goes wrong:** DATA-04 "stone types" section is blank because `prisma/seed.ts` never seeded `StoneType`.
**Avoid:** add a `stoneTypes[]` seed (cut×size×quality presets per PROJECT.md, e.g. `ruby_aaaa`, ROUND/OVAL/… presets) + the Admin CRUD. Confirm the canonical initial set with the team (Open Question 3).
**Warning signs:** the settings "Stone types" tab renders zero rows on a freshly seeded DB.

### Pitfall 7: Settings changes assumed retroactive
**What goes wrong:** Editing a camera view is expected to re-render existing batches.
**Avoid:** UI-SPEC copy already states "Changes apply to new batches, not to renders already created." Phase 3 reads current settings at batch-build time; Phase 2 just persists. Don't add retroactive propagation.

### Pitfall 8: Prisma in middleware / wrong runtime
**What goes wrong:** Any new route/action importing Prisma must be Node runtime; an accidental edge runtime crashes.
**Avoid:** keep `export const runtime = "nodejs"` on new route handlers; Server Actions run on Node by default. (Inherited Phase-1 Pitfall 1.)

---

## Code Examples

### Inspection model (schema addition — DATA-01 stable extension)
```prisma
// prisma/schema.prisma — ADD. Inspection has NO batch (unlike Job).
model Inspection {
  id          String   @id @default(cuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  runpodJobId String?
  status      String   @default("in_queue") // in_queue|in_progress|completed|failed
  inventory   Json?                          // parsed inspect_materials.py output (MESH objects + materials)
  error       String?
  createdAt   DateTime @default(now())
  finishedAt  DateTime?
  @@index([productId])
}
// add to model Product:  inspections Inspection[]
```
> Migration: `npx prisma migrate dev --name add-inspection` (against `DIRECT_URL`). `Product.status` stays a `String` (existing) — Phase 2 just uses the value convention `needs_inspection|inspecting|needs_groups|ready|inspection_failed` matching UI-SPEC status pills.

### StoneType seed addition (DATA-04 prerequisite)
```ts
// prisma/seed.ts — ADD (currently absent). Confirm canonical set with team (Open Q3).
const stoneTypes = [
  { key: "diamond",     label: "Diamond",     preset: { type: "diamond" } },
  { key: "ruby_aaaa",   label: "Ruby AAAA",   preset: { type: "ruby", grade: "AAAA" } },
  { key: "sapphire",    label: "Sapphire",    preset: { type: "sapphire" } },
  { key: "emerald",     label: "Emerald",     preset: { type: "emerald" } },
  // … cut × size × quality catalog from PROJECT.md context lines 64
];
for (const s of stoneTypes) {
  await prisma.stoneType.upsert({ where: { key: s.key }, update: s, create: s });
}
```

### Settings validation (zod — DATA-04)
```ts
// lib/validation/settings.ts
import { z } from "zod";
export const cameraViewSchema = z.object({
  key: z.string().min(1), label: z.string().min(1),
  azimuth: z.number().min(-180).max(180),
  elevation: z.number().min(-90).max(90),
  focalMm: z.number().positive(),                 // "Focal must be greater than 0."
  fStop: z.number().min(0.7).max(32),             // "Use an f-stop between 0.7 and 32."
});
export const metalSchema = z.object({
  key: z.string().min(1), label: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex like #C9A227"),
});
export const qualityPresetSchema = z.object({
  key: z.string().min(1), label: z.string().min(1),
  samples: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(),
});
```

### Product list read (Server Component — mirrors admin/settings/page.tsx)
```tsx
// app/(app)/products/page.tsx
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function ProductsPage() {
  await requireSession();
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assignments: true } } },
  });
  // render product-card grid (UI-SPEC §1); status pill from product.status
}
```

---

## State of the Art

| Old approach | Current approach | When | Impact for Phase 2 |
|--------------|------------------|------|--------------------|
| Mutations via REST route + client `fetch` + `router.refresh()` (Phase-1 user-admin) | Server Actions + `revalidatePath` | Next 13.4+ (stable in 15) | Recommended for new Phase-2 mutations; less boilerplate |
| Public Vercel Blob + signed URLs | Private store + `access:'private'` + authed proxy | `@vercel/blob` ≥2.3 | Already settled in Phase 1; client `upload()` supports `access:'private'` |
| `params` sync object in route handlers | `params` is a `Promise` (await it) | Next 15 | The Phase-1 `[id]` route already uses `params: Promise<{id}>` — follow it |
| Per-request RunPod polling fan-out | Webhook + Cron reconcile | Phase-4 design | Phase 2 inspection uses a single on-demand poll (short job), NOT fan-out |

**Deprecated/outdated:** signed-URL mental model for private Blob; treating `onUploadCompleted` as a reliable DB-write hook in dev; Prisma 7/`@latest` (locked to 6).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The model URL passed to `submitRunPod({operation:'inspect_materials', model})` must be a URL the RunPod worker can GET; the worker's auth/access model for private blobs needs confirmation by reading `handler.py`'s download path | Pattern 3 / Open Q1 | MED — if the worker can't read a private blob, inspection fails; may need a worker-readable delivery (signed token, service header, or a temporary access path). Verify before coding dispatch. |
| A2 | The RunPod inspect path returns the inventory location in `status.output` (URL or inline) | Pattern 3 / Open Q2 | MED — exact `output` field shape drives the parser's fetch step; read `handler.py` inspect branch at plan time. |
| A3 | `StoneType` is NOT seeded in Phase 1 | Pitfall 6 / DATA-04 | LOW — verified: `prisma/seed.ts` read this session seeds views/metals/groups/quality + admin only; no stoneType. |
| A4 | Recommended initial `StoneType` set (diamond/ruby_aaaa/sapphire/emerald + cut×size catalog) | Code Examples | MED — the exact catalog (cut × size × quality grades) is the rendering team's; confirm canonical list (Open Q3) before seeding. |
| A5 | "Required groups" for `ready` status = at least `alloycolour` + `diamond` assigned (side stones optional) | Pattern 5 | LOW-MED — UI-SPEC allows intentionally-unassigned objects; the exact "ready" rule should be confirmed. Recommend: ready when ≥1 object in `alloycolour` AND every detected stone-ish object is grouped, else `needs_groups`. |
| A6 | Server Actions are acceptable (vs. route handlers) for Phase-2 mutations | Pattern 2 / Discretion | LOW — both work; the planner may choose route handlers to match Phase-1 exactly. |
| A7 | The existing upload token route omits `access` and therefore mints public tokens | Pattern 1 / Pitfall 1 | LOW — verified by reading the route this session; `access` is absent from the returned object. |
| A8 | `inspect_materials.py` includes non-MESH objects (empties/cameras/lights) | Pattern 4 / Pitfall 5 | LOW — verified: `object_summary` runs over `bpy.data.objects` unfiltered; only MESH gets `bounds`. |

---

## Open Questions

1. **How does the RunPod worker read the (private) model blob for inspection?**
   - Known: the worker (`handler.py`) downloads the model from a URL; new uploads are private; private blobs are served via the authed `/api/file` proxy which requires a session cookie the worker won't have.
   - Unclear: whether the worker authenticates to Blob directly (it has `BLOB_READ_WRITE_TOKEN`) and can fetch by pathname, or whether dispatch must hand it a worker-readable URL.
   - Recommendation: at plan time, read `workers/runpod-blender/handler.py` download path. If the worker uses `BLOB_READ_WRITE_TOKEN` to fetch by pathname, pass the **pathname**; otherwise mint a worker-scoped access. This is the single highest-risk unknown for PROD-02.

2. **Exact `getRunPodStatus().output` shape for the inspect operation?**
   - Known: `inspect_materials.py` writes `material_inventory.json` and the handler uploads it to Blob.
   - Recommendation: read the inspect branch of `handler.py` to confirm whether `output` is the inventory JSON inline or a Blob URL; the parser fetch step depends on it.

3. **Canonical `StoneType` catalog to seed (DATA-04)?**
   - Known: PROJECT.md lists cut × size × quality (ROUND/OVAL/HEART/PRINCESS/TRILLION/EMERALD; grades AAAA → `ruby_aaaa`).
   - Recommendation: seed a minimal sensible set now (diamond + a few colored stones) and ship the Admin CRUD so the team curates the full catalog in-app. Confirm whether a fuller seed is wanted.

4. **Exact "ready" rule for product status (A5)?**
   - Recommendation: `ready` when `alloycolour` has ≥1 object and no stone-typed mesh is left `unassigned`; otherwise `needs_groups`. Confirm with the workflow owner; it affects the status pill and (Phase-3) batch-builder gating.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm + Next 15 | all | ✓ | `next ^15.1.4` | — |
| Prisma + Railway Postgres | all persistence | ✓ (migrated in Phase 1; pool healthy) | `6.19.2` | — |
| `@vercel/blob` private store | PROD-01 upload | ✓ (private store connected Phase 1) | `^2.4.0` | none — required |
| RunPod endpoint (`inspect_materials`) | PROD-02 | ✓ (endpoint live; worker has the op) | — | none — required for inspection |
| Vitest harness | validation | ✓ (`test/setup.ts`, `vitest.config.ts`, factories) | `vitest ^4.1.8` | — |
| shadcn CLI (add components) | UI surfaces | ✓ | `shadcn ^4.10.0` | hand-build first-party components |
| ngrok / tunnel | only if testing `onUploadCompleted` locally | ✗ | — | not needed — DB write is client-Server-Action-driven (Pitfall 2) |

**Missing with no fallback:** none — every Phase-2 dependency is already provisioned by Phase 1.
**Missing with fallback:** local `onUploadCompleted` testing (avoid by design — persist via Server Action, not the completion hook).

---

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` → section included. Harness already exists from Phase 1 — extend it, don't reinstall.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Vitest 4.1.8** (installed; `vitest.config.ts` present — `node` env, `@/*` alias via `vite-tsconfig-paths`, `next/server` alias + `next-auth`/`@auth/core` inlined) |
| Config file | `vitest.config.ts` (exists — no change needed) |
| Setup | `test/setup.ts` (`.env.local` loader, `fakeSession(role)`, `testPrisma`); `test/factories.ts` (user factories — add product/inventory factories) |
| Quick run command | `npx vitest run test/<file>.test.ts` |
| Full suite command | `npm test` (`vitest run`) |
| Mocking convention | `vi.mock("@/lib/db/prisma")` + `vi.mock("@/lib/auth/rbac")` (exactly as `test/user-admin.test.ts`); for inspection, `vi.mock("@/lib/runpod")` |

### Phase Requirements → Test Map
| Req | Behavior | Type | Automated command | File exists? |
|-----|----------|------|-------------------|-------------|
| PROD-01 | upload token route: unauth POST → 401; authed returns token with `access:'private'` | integration (mock requireSession) | `npx vitest run test/product-upload-token.test.ts` | ❌ Wave 0 |
| PROD-01 | `createProduct` action: zod-valid input persists Product w/ `modelUrl`/`modelFormat`/`status='needs_inspection'`; invalid → no write | unit (mock prisma+session) | `npx vitest run test/product-create.test.ts` | ❌ Wave 0 |
| PROD-02 | `startInspection` submits `{operation:'inspect_materials', model}` to RunPod + records Inspection row | unit (mock runpod+prisma) | `npx vitest run test/inspection-dispatch.test.ts` | ❌ Wave 0 |
| PROD-02 | `parseInventory()` over an `inspect_materials.py` JSON fixture: filters MESH, extracts BSDF defensively, "—" for absent sockets | unit (pure) | `npx vitest run test/inventory-parser.test.ts` | ❌ Wave 0 |
| PROD-02 | `pollInspection` on COMPLETED updates status + inventory; on FAILED records error | unit (mock runpod+prisma) | `npx vitest run test/inspection-dispatch.test.ts` | ❌ Wave 0 |
| PROD-03 | `saveAssignments` upserts one row per group with correct `objectTokens[]`; load round-trips | unit (mock prisma) | `npx vitest run test/assignment-save.test.ts` | ❌ Wave 0 |
| PROD-03 | `suggestGroup(signature)` maps band/metal→alloycolour, center/diamond→diamond, etc. | unit (pure) | `npx vitest run test/tokens.test.ts` | ❌ Wave 0 |
| PROD-04 | assignment shape is consumable as holdout `contains` tokens (assert tokens are object signatures, not ids) | unit | `npx vitest run test/assignment-save.test.ts` | ❌ Wave 0 |
| PROD-05 | products list query orders by recency + includes status; detail loads product+inspection+assignments | integration (live or mocked) | `npx vitest run test/product-list.test.ts` | ❌ Wave 0 |
| DATA-04 | Admin `saveDomainSettings` persists; Operator → 403 (server-side); zod rejects focal≤0 / bad hex / fstop out-of-range | integration (mock requireRole) | `npx vitest run test/settings-edit.test.ts` | ❌ Wave 0 |
| DATA-04 | StoneType seed creates the initial rows idempotently | unit (post-seed query, live DB) | `npx vitest run test/stonetype-seed.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test>` + `npx prisma validate` if schema touched.
- **Per wave merge:** `npm test` (full) + `npx prisma migrate deploy` against scratch DB if a migration was added.
- **Phase gate:** full suite green + manual checks before `/gsd:verify-work`:
  - Upload a real ~50MB GLB → confirm it lands **private** (incognito `result.url` → not readable) and is viewable via `/api/file`.
  - Run a real inspection end-to-end against the live RunPod endpoint; confirm inventory renders.
  - Operator deep-links `/admin/settings` → `/forbidden`; Admin edits a camera view + saves → persists.

### Wave 0 Gaps
- [ ] `test/factories.ts` — add `productFactory`, `inventoryFixture` (a representative `inspect_materials.py` JSON incl. a non-MESH node + a glass material), `assignmentFactory`.
- [ ] `prisma/migrations/*_add_inspection` — generated by `migrate dev` (Wave 0 schema task).
- [ ] `prisma/seed.ts` StoneType block (DATA-04 prerequisite).
- [ ] Test files listed above (all new this phase).
- [ ] *(No framework install — Vitest already configured.)*

---

## Security Domain

`security_enforcement` not `false` → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Reuse Phase-1 boundaries; no new trust zones |
| V4 Access Control | **yes** | `requireSession()` on all product/inspection/assignment actions; `requireRole("Admin")` on settings + StoneType edits (server-side, AUTH-05) |
| V5 Input Validation | **yes** | zod on every payload (product create, assignment, settings); restrict upload `allowedContentTypes`; reject non-model extensions client+server |
| V8 Data Protection | **yes** | Model + inventory blobs **private** (`access:'private'`), delivered only via authed `/api/file`; never persist/render public URLs |
| V12 Files/Resources | **yes** | Validate file type/size before upload; `addRandomSuffix`; private store; the model is untrusted input rendered only by the sandboxed RunPod worker |
| V13 API | yes | Server Actions/route handlers return typed errors; no stack/secret leakage in error copy (UI-SPEC calm copy) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Anonymous upload-token minting | Spoofing/Tampering | `requireSession()` in `onBeforeGenerateToken` (already present) + `access:'private'` |
| Model/inventory leak by public URL | Info Disclosure | Private store + authed `/api/file` proxy; never store/render `result.url` |
| Operator escalates to edit domain settings | Elevation | `requireRole("Admin")` in the settings **action** (not just the page redirect) |
| Malicious/oversized model upload | DoS/Tampering | content-type allowlist + size cap (≤50MB) enforced client+token; worker timeout (`BLENDER_TIMEOUT_SECONDS`) already bounds GPU |
| SQL injection | Tampering | Prisma parameterized queries only |
| Stored XSS via object/material names in inventory | Tampering/XSS | React escapes by default; render names as text (mono), never `dangerouslySetInnerHTML` |
| IDOR on `/products/[id]` | Access Control | single-tenant team; still `requireSession()`; (multi-tenant ownership is out of scope) |

---

## Sources

### Primary (HIGH)
- **Live repository inspection (this session):** `prisma/schema.prisma` (Product/ObjectGroupAssignment/Inspection-absent/Job/Batch + domain models), `prisma/seed.ts` (no StoneType seed), `lib/runpod.ts` (`submitRunPod`/`getRunPodStatus`), `lib/auth/rbac.ts` (`requireSession`/`requireRole`), `app/api/blob/upload/route.ts` (token route — **`access` omitted**), `app/api/file/route.ts` (private proxy), `lib/blob.ts` (`putPrivate`/`privateUrl`), `workers/runpod-blender/inspect_materials.py` (inventory JSON shape), `app/(app)/admin/settings/page.tsx` (read-only view to upgrade), `app/(app)/layout.tsx` (app shell), `app/api/admin/users/route.ts` + `app/(app)/admin/users/create-user-dialog.tsx` + `test/user-admin.test.ts` (CRUD + test mocking pattern), `package.json`, `vitest.config.ts`, `test/setup.ts`, `test/factories.ts`, `.planning/config.json`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `02-UI-SPEC.md`.
- **vercel.com/docs/vercel-blob/client-upload** (last_updated 2026-03-27) — `upload(pathname, file, {access, handleUploadUrl, onUploadProgress, multipart})`; `access:'private'` settable in client upload via `onBeforeGenerateToken`; 4.5MB rationale; `onUploadCompleted` doesn't fire on localhost; `validUntil` for >100MB.
- **01-RESEARCH.md** — locked stack, private-Blob proxy model (Pattern 4/Pitfall 5), Prisma pooling, split-config auth, requireRole pattern (all cross-checked against the live tree).

### Secondary (MEDIUM)
- WebSearch (Vercel community + docs) — confirmed `onBeforeGenerateToken` params (`pathname`, `clientPayload`, `multipart`) and `validUntil` for large files.
- Next.js App Router Server Actions / `revalidatePath` — training + Phase-1 patterns (params-as-Promise confirmed in the existing `[id]` route).

### Tertiary (LOW / flagged)
- Exact RunPod inspect `output` shape + worker private-blob read path (Open Q1/Q2) — must be confirmed by reading `handler.py` at plan time.
- Canonical StoneType catalog (Open Q3) — team-owned domain data.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every library read from live `package.json`.
- Upload (PROD-01): HIGH — `upload()` API + `access:'private'` re-verified against current Vercel docs; the token-route fix is verified by reading the route.
- Inspection (PROD-02): MEDIUM — dispatch/poll/parse pattern is solid and the inventory JSON shape is verified; the worker's model-read auth and the `status.output` field are the two confirmable-at-plan-time unknowns (Open Q1/Q2).
- Assignment (PROD-03/04): HIGH — schema + signature convention verified; PROD-04 is explicitly persist-shape-only (full use Phase 3).
- Settings (DATA-04): HIGH — pattern mirrors Phase-1 admin CRUD; the one real gap (unseeded StoneType) is verified and addressed.
- Validation: HIGH — harness exists; tests mirror `test/user-admin.test.ts` exactly.

**Research date:** 2026-06-05
**Valid until:** ~2026-07-05 (30 days — stack is frozen/installed; only re-check the Vercel client-upload `access:'private'` behavior if `@vercel/blob` is bumped).
