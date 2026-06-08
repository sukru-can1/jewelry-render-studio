# Phase 3: Batch Builder with Cost Guardrails - Research

**Researched:** 2026-06-05
**Domain:** Render-batch matrix expansion, cost guardrails, transactional fan-out (Next.js 15 Server Actions + Prisma over Postgres), reuse of the deterministic recipe generator
**Confidence:** HIGH (entire phase is in-repo reuse; all critical claims verified against actual source files)

## Summary

Phase 3 turns one `ready` product into a render *batch*: the operator picks angles × metals × per-group stone types × layered passes, sees a live job-count/cost estimate gated by a soft threshold and a hard cap, and on submit the matrix is expanded **transactionally** into one `Job` row per `(angle × metal × stone-assignment × pass)`, each carrying a recipe produced by the **existing** `lib/enterprise-recipes.ts`. Phase 3 writes DB rows only — it does **not** dispatch to RunPod or poll (that is Phase 4 / ORCH-01..05). This boundary is explicit in the UI-SPEC ("a Phase 4 surface that does not exist yet") and confirmed by `lib/runpod.ts` having no batch caller.

Nearly everything is reuse. The recipe generator `buildEnterpriseRecipe()` is a pure function taking an `EnterpriseRecipeRequest` and returning a `Record<string, unknown>` — exactly what `Job.recipe` (a `Json?` column) stores. The Prisma `Batch`/`Job` models already exist with the right shape (`Batch.matrix Json?`, `Batch.jobCount Int`, `Job.recipe Json?`, `Job.combo Json?`, `Job.status JobStatus @default(queued)`). The domain tables (`CameraView`, `Metal`, `StoneType`, `QualityPreset`) are seeded and Admin-editable; the builder reads them live. The product's `ObjectGroupAssignment` rows already store the object **signatures** that become the recipe's `groupTokens` (`contains`) for include/exclude/holdout — this is the documented Phase 2→3 bridge (`lib/products/assignments.ts` header comment).

The two genuinely new pieces of *logic* (beyond UI) are: (1) a pure **selection → job-count → cost-estimate** model with thresholds in a single config module, enforced on **both** client and server (BATCH-06 runaway protection); and (2) a **domain-key → enterprise-recipes-key binding** layer (`view1→hero`, `red→rose`, `StoneType.key → EnterpriseStoneMaterial`) plus a `$transaction` that creates the `Batch` + N `Job` rows all-or-none (BATCH-07). The recipe generator currently hardcodes 4 angle keys and 4 stone materials; the binding layer must map the live DB domain onto those keys and validate that any chosen stone type resolves to a supported material.

**Primary recommendation:** Add `lib/batches/estimate.ts` (pure count/cost + thresholds config), `lib/batches/binding.ts` (domain→recipe-key maps), and `lib/batches/actions.ts` (the `createBatch` Server Action: `requireSession` → product/IDOR check → server-side hard-cap re-check → build combos → `buildEnterpriseRecipe` per combo → single `prisma.$transaction(async tx => …)` interactive transaction creating Batch + Jobs). Reuse `buildEnterpriseRecipe` verbatim — never re-derive recipes. Mirror the existing Vitest mocking harness (`test/assignment-save.test.ts`) for all tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Render selectors (angles/metals/stone-types/passes/quality) | Browser/Client (React client component) | Frontend Server (RSC loads domain) | Interactive multi-select state; live estimate must update on every change |
| Domain table reads (CameraView/Metal/StoneType/QualityPreset) | API/Backend (Prisma on server) | — | Authoritative, Admin-editable; load in a server component or server action, never trust client copies |
| Live job-count + cost estimate display | Browser/Client | — | Pure function of selection; instant, debounced UI feedback |
| **Job-count + hard-cap math (source of truth)** | API/Backend | Browser/Client (mirror for UX) | BATCH-06 runaway protection — the cap MUST be re-enforced server-side; client value is advisory only |
| Domain-key → recipe-key binding | API/Backend (`lib/batches/binding.ts`) | — | Submission-time mapping; UI never shows recipe keys (UI-SPEC §"Domain ↔ recipe binding") |
| Recipe generation per combo | API/Backend (reuse `lib/enterprise-recipes.ts`) | — | Pure deterministic function; must be reused not reinvented |
| Transactional Batch + Job creation | API/Backend + Database (`prisma.$transaction`) | — | All-or-none atomicity (BATCH-07); a failure must roll back the whole batch |
| AuthZ (requireSession) + IDOR (product ownership) | API/Backend (`lib/auth/rbac.ts`) | — | Fail-closed first line of the Server Action; product scoping |
| RunPod dispatch / status polling | **OUT OF SCOPE — Phase 4** | — | Phase 3 creates `queued` rows only; ORCH-01..05 owns dispatch |

## Standard Stack

This phase adds **no new runtime dependencies**. Everything is in-repo reuse + two new shadcn components (UI-SPEC: `toggle-group`, `alert`).

### Core (all already installed — verified `package.json`)
| Library | Version (pinned) | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `@prisma/client` / `prisma` | `6.19.2` | `Batch`/`Job` writes, `$transaction` | [VERIFIED: package.json] Project lock; do NOT bump to 7.x |
| `next` | `^15.1.4` | App Router, Server Actions (`"use server"`) | [VERIFIED: package.json] Existing mutation pattern |
| `react` / `react-dom` | `^19.0.0` | Client builder component | [VERIFIED: package.json] |
| `zod` | `^3.25.76` | Validate the submit payload (selection) server-side | [VERIFIED: package.json] Project STACK lock is zod **v3** — do NOT use v4 idioms |
| `react-hook-form` + `@hookform/resolvers` | `^7.77.0` / `^5.4.0` | Builder form state (optional; matches Phase 2) | [VERIFIED: package.json] |
| `lucide-react` | `^0.468.0` | Icons (UI-SPEC lists glyphs) | [VERIFIED: package.json] |

> **Version note (provenance):** `npm view @prisma/client version` returns `7.8.0` and `npm view zod version` returns `4.4.3` as the *latest registry* versions [VERIFIED: npm registry]. The project deliberately pins Prisma `6.19.2` and zod `3.25.76`. **Plan against the pinned versions, not latest.** Bumping either is out of scope for Phase 3.

### Supporting (new shadcn components — official registry only)
| Component | Source | Purpose | When to Use |
|-----------|--------|---------|-------------|
| `toggle-group` | shadcn/ui official | multi-select chip groups (angles/metals/passes) | UI-SPEC §"New shadcn components" |
| `alert` | shadcn/ui official | over-hard-cap blocking banner + over-threshold notice | UI-SPEC §"New shadcn components" |

Install via the project's existing shadcn setup: `npx shadcn@latest add toggle-group alert`. No third-party registries (UI-SPEC §Registry Safety).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Action `createBatch` | API route `app/api/batches/route.ts` | Project uses BOTH patterns; Phase 2 mutations (assignments, inspection, settings) are **Server Actions** with `requireSession()`/`requireRole()` first — follow that for consistency. Admin user CRUD uses API routes. Recommend Server Action to match the product-workspace mutation convention. |
| `prisma.$transaction(async (tx) => …)` (interactive) | `prisma.$transaction([...])` (array/batch) | Array form can't build later writes from earlier results, but here all Job rows are known up-front, so either works. **Recommend interactive callback** for clarity + ability to throw-to-rollback on a per-combo recipe build failure. |
| `createMany` for jobs inside the tx | per-row `create` loop | `createMany` is faster and atomic within the tx, but on some Postgres/Prisma combos does not return created rows. Combos + recipes are all precomputed, so `createMany({ data: jobRows })` is fine and preferred. |

**Installation:**
```bash
npx shadcn@latest add toggle-group alert
# no npm install needed — no new runtime deps
```

## Package Legitimacy Audit

> No external packages are installed this phase. Only official shadcn/ui component source (`toggle-group`, `alert`) is added, which copies vetted first-party component code into the repo — no registry install of an npm dependency. slopcheck N/A (no third-party package to vet).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none — no new deps) | — | — | — | — | N/A | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────┐
  Product detail    │  Batch Builder (client component)                    │
  "Build batch" ───▶│   /products/[id]/batches/new                         │
  (enabled iff      │                                                       │
   status=ready)    │   angles[]  metals[]  stoneTypePerGroup{}            │
                    │   passes[]  qualityKey                                │
                    └───────────────┬───────────────────────┬─────────────┘
                                    │ (live, debounced)      │ submit
                  reads domain      ▼                        │
            ┌───────────────┐  ┌─────────────────────┐       │
            │ CameraView    │  │ estimate.ts (PURE)  │       │
            │ Metal         │─▶│ jobCount = |a|×|m|   │       │
            │ StoneType     │  │           ×|passes|  │       │
            │ QualityPreset │  │ cost/time + zones    │       │
            │ (Admin-edit)  │  │ SOFT=48 HARD=200     │       │
            └───────────────┘  └─────────────────────┘       │
                                    │ idle/safe/warn/block    │
                                    ▼                         ▼
                          (client gate: confirm dialog   ┌──────────────────────────┐
                           if warn; disable if block)    │ createBatch (Server Action)│
                                                          │  1 requireSession()        │
            ┌──────────────────────┐  product+assignment  │  2 load product (IDOR:     │
            │ ObjectGroupAssignment│─────────────────────▶│    own/exists?)            │
            │  group→objectTokens  │  (signatures =        │  3 zod-validate selection  │
            │  (signatures)        │   contains tokens)    │  4 RE-CHECK hard cap (server│
            └──────────────────────┘                       │    authoritative)          │
                                                          │  5 binding: view→hero,     │
            ┌──────────────────────┐                       │    red→rose, stoneType→mat │
            │ enterprise-recipes.ts│◀──────────────────────│  6 for each combo:         │
            │ buildEnterpriseRecipe│  one call per combo   │    buildEnterpriseRecipe() │
            │  (PURE, REUSED)      │──────────────────────▶│  7 prisma.$transaction:    │
            └──────────────────────┘  Record<string,…>     │    create Batch + N Jobs   │
                                                          │    (status=queued) ALL/NONE│
                                                          └─────────────┬──────────────┘
                                                                        ▼
                                                          ┌──────────────────────────┐
                                                          │ Batch{matrix,jobCount}    │
                                                          │ Job[]{combo,recipe,queued}│
                                                          │  ── Phase 4 dispatches ──▶ │
                                                          └──────────────────────────┘
```

### Recommended Project Structure
```
lib/batches/
├── estimate.ts        # PURE: countJobs(selection) + estimateCost() + THRESHOLDS config + zone()
├── binding.ts         # domain-key → enterprise-recipes-key maps + resolveStoneMaterial()
├── expand.ts          # selection + assignment → Combo[] (cartesian) → recipe per combo
└── actions.ts         # "use server" createBatch: auth, IDOR, validate, server cap, $transaction

lib/validation/
└── batch.ts           # zod schema for the createBatch selection payload (v3 idioms)

app/products/[id]/batches/new/
├── page.tsx           # RSC: requireSession, load product+assignment+domain, guard not-ready
└── batch-builder.tsx  # client component: selectors + live estimate + confirm dialog

components/batches/    # first-party UI (estimate panel, stone-type picker, pass selector, matrix summary)

test/
├── batch-estimate.test.ts     # count math + cap edges + cost (pure, no mocks)
├── batch-binding.test.ts      # view→hero, red→rose, stoneType→material, unsupported reject
├── batch-expand.test.ts       # combos + recipe-per-combo reuses buildEnterpriseRecipe
└── batch-create.test.ts       # createBatch: auth, IDOR, server cap, transactional all-or-none
```

### Pattern 1: Server Action mutation, fail-closed first line
**What:** Every Phase 2 mutation is a `"use server"` action whose FIRST statement is `await requireSession()` (or `requireRole`). Throws a `Response` (401/403) so a forgotten catch still fails closed.
**When to use:** `createBatch` — identical shape.
**Example:**
```typescript
// Source: lib/products/assignments.ts (verified) + lib/products/inspection.ts
"use server";
import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

export async function createBatch(input: unknown) {
  await requireSession();                          // fail-closed, line 1
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.flatten() };
  // ... product/IDOR check, server cap, expand, transaction ...
}
```

### Pattern 2: Single-transaction all-or-none write (BATCH-07)
**What:** Prisma `$transaction` wraps the whole batch creation; any throw rolls back every write. The repo already uses both the array form (`assignments.ts`, `settings/actions.ts` upserts) and the interactive callback form (`settings/actions.ts` `saveStoneTypes`).
**When to use:** Create `Batch` then its `Job[]` atomically.
**Example:**
```typescript
// Source: lib/settings/actions.ts saveStoneTypes (verified — interactive form)
const batch = await prisma.$transaction(async (tx) => {
  const b = await tx.batch.create({
    data: { productId, createdById: session.user.id, status: "draft",
            matrix: matrixSnapshot as Prisma.InputJsonValue, jobCount: jobRows.length },
  });
  await tx.job.createMany({
    data: jobRows.map((j) => ({
      batchId: b.id,
      status: "queued",                              // JobStatus enum default
      combo: j.combo as Prisma.InputJsonValue,
      recipe: j.recipe as Prisma.InputJsonValue,     // Record<string,unknown> from generator
    })),
  });
  return b;
});
// If buildEnterpriseRecipe or any write throws, NOTHING is persisted (all-or-none).
```
> **Prisma Json input typing pitfall (verified in-repo):** `Record<string, unknown>` is NOT assignable to Prisma's `Json` input directly. The repo casts via `as Prisma.InputJsonValue` (see `inspection.ts:120`, `settings/actions.ts:197`). The recipe from `buildEnterpriseRecipe()` returns `Record<string, unknown>` — cast it the same way.

### Pattern 3: Reuse the recipe generator — never re-derive recipes
**What:** `buildEnterpriseRecipe(request: EnterpriseRecipeRequest): Record<string, unknown>` is a pure function. Call it once per combo.
**EnterpriseRecipeRequest shape (verified `lib/enterprise-recipes.ts:9-19`):**
```typescript
type EnterpriseRecipeRequest = {
  angle: "hero" | "front" | "top" | "profile";              // EnterpriseAngleKey
  groupTokens: Record<"alloycolour"|"diamond"|"stone2"|"stone3", string[]>; // from assignment signatures
  metal: "white" | "yellow" | "rose";                        // EnterpriseMetal (DB "red" → "rose")
  pass: "full" | "metal" | "stone";                          // P3 uses metal + stone only
  productName: string;                                       // Product.name → slug()
  resolution: number;                                        // QualityPreset.width (square in seed)
  samples: number;                                           // QualityPreset.samples
  stoneGroup?: "diamond" | "stone2" | "stone3";              // required for pass:"stone"
  stoneMaterials: Record<"diamond"|"stone2"|"stone3", "diamond"|"sapphire"|"emerald"|"ruby">;
};
```
**Critical reuse facts (verified):**
- `groupTokens` ← the product's saved `ObjectGroupAssignment.objectTokens` (object signatures). `buildVisibility()` (line 138) uses these as the holdout include/exclude. If a group has no tokens, the generator falls back to `FALLBACK_TOKENS` (line 118) — so a metal-only product still produces a valid recipe.
- `pass:"metal"` → include alloycolour tokens, exclude all stone tokens (the JPEG metal pass, BATCH-04).
- `pass:"stone"` + `stoneGroup` → include alloycolour + that group's tokens, exclude none (transparent holdout PNG for that group).
- `pass:"full"` is **NOT exposed in P3** (UI-SPEC binding table: "layered holdout passes only").
- `stoneMaterials` must include all three keys (`diamond/stone2/stone3`) even if the product lacks a group — `buildEnterpriseRecipe` reads all three for the `material_map` (lines 172-174). Supply a sensible default per absent group.
- `samples` + `resolution` come from the selected `QualityPreset` (seed: preview 64 / medium 256 / high 512 / ultra 2048; all `1920×1920`).

### Pattern 4: Domain → recipe-key binding (UI-SPEC contract)
**What:** The operator-facing vocabulary is the **DB domain**; submission maps it to the generator's hardcoded keys. The UI never shows the right-hand column.
```typescript
// lib/batches/binding.ts  — Source: 03-UI-SPEC.md "Domain ↔ recipe-generator binding"
// Camera view → angle (POSITIONAL by sorted CameraView.key; live list, do NOT assume exactly 4)
const ANGLE_ORDER = ["hero", "front", "top", "profile"] as const;
// metal: DB key → EnterpriseMetal ("red" → "rose")
const METAL_MAP = { white: "white", yellow: "yellow", red: "rose" } as const;
// StoneType.key → EnterpriseStoneMaterial (generator supports ONLY 4 materials)
const SUPPORTED = new Set(["diamond","sapphire","emerald","ruby"]);
// e.g. pink_sapphire → sapphire; moissanite/black_diamond → diamond; unknown → reject or default
```
**When to use:** inside `createBatch`, before calling the generator. **Planner must validate** that each chosen `StoneType.key` resolves to a supported material (the seed has 10 stone types but the generator supports 4 — `binding.ts` owns the mapping table; flag unmapped types).

### Anti-Patterns to Avoid
- **Trusting the client job count / cap:** the client estimate is UX only. The server MUST recompute `jobCount` from the validated selection and reject `> HARD_CAP` with no write (BATCH-06 runaway protection). [VERIFIED: must-cover + UI-SPEC §Color thresholds]
- **Re-deriving recipes inline:** never hand-build recipe JSON in the action — call `buildEnterpriseRecipe`. The generator owns lights/cameras/postprocess.
- **Multiplying by stone *type*:** `jobCount` is `|angles|×|metals|×|passes|`. Stone-type per group sets the *material*, it does NOT add jobs (UI-SPEC §Job-count formula).
- **Assuming exactly 4 camera views:** read the live `CameraView` list; positional-map onto `ANGLE_ORDER`. If the domain grows past 4, the planner must decide how to extend the angle set (Open Question 1).
- **Calling RunPod:** Phase 3 does not import `submitRunPod`/`getRunPodStatus`. Jobs land `status: "queued"` for Phase 4.
- **Hardcoding thresholds in the component:** SOFT/HARD live in one config module (`lib/batches/estimate.ts`), read by both client and server.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recipe JSON per combo | Custom recipe builder | `buildEnterpriseRecipe()` (`lib/enterprise-recipes.ts`) | Already encodes cameras, lights, holdout visibility, postprocess; tested by use |
| Holdout include/exclude tokens | New token logic | `groupTokens` from `ObjectGroupAssignment.objectTokens` + generator's `buildVisibility()` | Phase 2 already persisted the signatures as the `contains` tokens |
| AuthZ / fail-closed gate | Inline session checks | `requireSession()` (`lib/auth/rbac.ts`) | Throws `Response` (401) — fails closed; the repo-wide pattern |
| Atomic multi-row write | Manual rollback bookkeeping | `prisma.$transaction(async tx => …)` | DB-level all-or-none; no partial batches |
| Input validation | ad-hoc `if` checks | zod schema in `lib/validation/batch.ts` | Matches `lib/validation/product.ts`/`settings.ts` convention |
| Domain reads | Hardcoded angle/metal/quality lists | Live Prisma reads of `CameraView`/`Metal`/`QualityPreset`/`StoneType` | DATA-04 made them Admin-editable; builder must reflect edits |

**Key insight:** Phase 3 is 90% *wiring existing, verified parts together* + one small pure estimate module. The risk is not "building the wrong library" but "re-deriving something Phase 1/2 already produced" (recipes, tokens, auth). Reuse aggressively.

## Runtime State Inventory

> Not a rename/refactor/migration phase — this is greenfield feature work on existing models. Section included for completeness; no runtime-state migration required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `Batch`/`Job` rows only; models already exist in schema (verified `schema.prisma:131-159`). No migration needed beyond what Phase 1 shipped. | None — schema already present |
| Live service config | None — Phase 3 does not touch RunPod/Blob config | None |
| OS-registered state | None | None |
| Secrets/env vars | None new (no RunPod/Blob calls in P3) | None |
| Build artifacts | `prisma generate` already wired in `postinstall`/`build`; no new generation step | None |

**Nothing found in any category requiring migration — verified the `Batch`/`Job`/`Layer` models already exist in `prisma/schema.prisma` from Phase 1 (DATA-01).**

## Common Pitfalls

### Pitfall 1: Client-only cap enforcement (security / cost)
**What goes wrong:** Hard cap enforced only in React; a crafted Server Action call creates 10,000 jobs → runaway GPU cost in Phase 4.
**Why it happens:** The estimate panel is so prominent it feels authoritative.
**How to avoid:** `createBatch` recomputes `jobCount` from the validated selection and throws/returns an error if `> HARD_CAP`, before any write. Test it explicitly (`batch-create.test.ts`).
**Warning signs:** No server-side count assertion in the action; cap constant imported only by the client component.

### Pitfall 2: Prisma `Json` input type mismatch
**What goes wrong:** `Type 'Record<string, unknown>' is not assignable to 'JsonNull | InputJsonValue'` on `recipe`/`combo`/`matrix`.
**Why it happens:** Prisma's `InputJsonValue` is stricter than `Record<string, unknown>` (no string index signature). [VERIFIED in-repo: `inspection.ts:120`, `settings/actions.ts:197` both cast].
**How to avoid:** `recipe as Prisma.InputJsonValue` at the write site, matching the existing convention.
**Warning signs:** `tsc --noEmit` fails on the `job.createMany` data.

### Pitfall 3: Stone material not supported by the generator
**What goes wrong:** Operator picks `amethyst` (seeded `StoneType`) but `buildEnterpriseRecipe` only supports `diamond|sapphire|emerald|ruby` → `material_map` references `stone_amethyst` which the worker won't have.
**Why it happens:** The seed has 10 stone types; the generator's `STONE_PRESETS` has 4 (verified `enterprise-recipes.ts:27`).
**How to avoid:** `binding.ts` maps every `StoneType.key` to one of the 4 supported materials (or restricts the UI picker to mappable types). Validate at submit; reject/flag unmapped. **This is Open Question 2 — needs a decision.**
**Warning signs:** A chosen stone type with no entry in the binding map.

### Pitfall 4: Missing `stoneMaterials` keys for absent groups
**What goes wrong:** Product has only `alloycolour` + `diamond`; you pass `stoneMaterials: { diamond }` and the generator throws on `request.stoneMaterials.stone2`.
**Why it happens:** `buildEnterpriseRecipe` reads all three stone keys for `material_map` (lines 172-174) regardless of which groups exist.
**How to avoid:** Always pass a full `{ diamond, stone2, stone3 }` with sensible defaults for absent groups (e.g., `diamond`).
**Warning signs:** Runtime `undefined` in the generated `material_map` material name.

### Pitfall 5: Batch status / Job status vocabulary drift
**What goes wrong:** Setting `Job.status` to a string not in the `JobStatus` enum (`queued|submitted|in_queue|in_progress|completed|failed|cancelled` — verified `schema.prisma:21-29`) → Prisma rejects.
**Why it happens:** `Batch.status` is a free `String` (`@default("draft")`); `Job.status` is the strict `JobStatus` enum. They differ.
**How to avoid:** Job rows: `status: "queued"` (enum). Batch: `"draft"` on create, or a chosen initial value (UI-SPEC success state shows the batch pill = **queued**; planner decides Batch initial string — see Open Question 3).
**Warning signs:** Enum validation error on `job.create`.

### Pitfall 6: Reaching the builder for a non-ready product
**What goes wrong:** Operator navigates directly to `/products/[id]/batches/new` for a product with no saved assignment → empty `groupTokens`, meaningless recipes.
**Why it happens:** The "Build batch" button is gated in the UI, but the URL is reachable.
**How to avoid:** The RSC `page.tsx` loads the product + assignment; if `status !== "ready"` (or no assignment rows), render the no-assignment empty state (UI-SPEC surface 1 "no-assignment guard") and do not render selectors.
**Warning signs:** Builder renders with zero stone-group rows AND zero metal tokens.

## Code Examples

### Estimate model (pure, single config source — BATCH-05/06)
```typescript
// lib/batches/estimate.ts — Source: 03-UI-SPEC.md §Color (thresholds) + §Job-count formula
export const BATCH_LIMITS = { SOFT_THRESHOLD: 48, HARD_CAP: 200 } as const;
// Estimates only — NOT a guaranteed price. Per-job baseline scales with samples.
export const COST_MODEL = {
  gpuRatePerMinuteUsd: 0.012,   // ASSUMED — placeholder RunPod serverless GPU $/min; confirm with user
  baseSecondsPerJob: 25,        // ASSUMED fixed overhead per job
  secondsPerKSample: 14,        // ASSUMED render time per 1000 Cycles samples at 1920²
} as const;

export type Selection = {
  angleCount: number; metalCount: number; passCount: number; samples: number;
};
export function countJobs(s: Selection): number {
  return s.angleCount * s.metalCount * s.passCount;   // stone-type does NOT multiply
}
export function estimate(s: Selection) {
  const jobs = countJobs(s);
  const perJobMin = (COST_MODEL.baseSecondsPerJob + (s.samples / 1000) * COST_MODEL.secondsPerKSample) / 60;
  const minutes = jobs * perJobMin;
  return { jobs, minutes, costUsd: minutes * COST_MODEL.gpuRatePerMinuteUsd };
}
export function zone(jobs: number) {
  if (jobs <= 0) return "idle";
  if (jobs <= BATCH_LIMITS.SOFT_THRESHOLD) return "safe";
  if (jobs <= BATCH_LIMITS.HARD_CAP) return "warn";
  return "block";
}
```
> The cost constants are `[ASSUMED]` — they are reasonable placeholders, NOT verified RunPod pricing. They live in config (not hardcoded in the component) per BATCH-06 and the UI-SPEC, and the tooltip must say "Actual GPU time varies." Confirm real $/min with the user before treating cost as authoritative (Assumptions Log A1).

### Pass-set construction (BATCH-04)
```typescript
// passes = metal-only (always available) + one stone pass per stone group the product HAS
// from saved ObjectGroupAssignment (groups with objectTokens). Stone-type sets material, not count.
function buildPasses(presentStoneGroups: ("diamond"|"stone2"|"stone3")[], selected: Set<string>) {
  const passes: { pass: "metal" | "stone"; stoneGroup?: string }[] = [];
  if (selected.has("metal")) passes.push({ pass: "metal" });
  for (const g of presentStoneGroups) if (selected.has(g)) passes.push({ pass: "stone", stoneGroup: g });
  return passes;  // |passes| feeds the job-count formula
}
```

### Combo expansion → recipe per combo (BATCH-07)
```typescript
// lib/batches/expand.ts — reuse buildEnterpriseRecipe, never re-derive
import { buildEnterpriseRecipe, type EnterpriseRecipeRequest } from "@/lib/enterprise-recipes";
for (const angleKey of angles)        // mapped DB view → "hero"|"front"|...
  for (const metalKey of metals)      // mapped DB "red" → "rose"
    for (const p of passes) {         // {pass, stoneGroup?}
      const req: EnterpriseRecipeRequest = {
        angle: angleKey, metal: metalKey, pass: p.pass, stoneGroup: p.stoneGroup as any,
        productName, groupTokens, stoneMaterials, samples, resolution,
      };
      jobRows.push({ combo: { angleKey, metalKey, ...p }, recipe: buildEnterpriseRecipe(req) });
    }
```

### Test harness reuse (mirrors test/assignment-save.test.ts — verified)
```typescript
// test/batch-create.test.ts — same mocking shape as assignment-save.test.ts
const requireSessionMock = vi.hoisted(() => vi.fn(async () => fakeSession("Operator")));
vi.mock("@/lib/auth/rbac", () => ({ requireSession: requireSessionMock, requireRole: vi.fn() }));
const batchMock = vi.hoisted(() => ({ create: vi.fn() }));
const jobMock   = vi.hoisted(() => ({ createMany: vi.fn() }));
const productMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  batch: batchMock, job: jobMock, product: productMock,
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Assert: server rejects >HARD_CAP with no create; a throw mid-tx → no batch persisted (all-or-none).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Blob-JSON job records (legacy `lib/jobs.ts`) | Postgres `Batch`/`Job` via Prisma | Phase 1 (DATA-01) | Phase 3 writes relational rows, not blobs; `lib/jobs.ts` is legacy and not used here |
| Per-request RunPod status fan-out (legacy) | Webhook + cron reconcile | Phase 4 (ORCH-02) | Phase 3 does NOT poll; just creates `queued` rows |
| Recipe pasted/hand-edited (Studio/Lab) | Structured builder → `buildEnterpriseRecipe` | This phase | Operators never touch recipe JSON (Out-of-scope: "recipe-editing sandbox as operator surface") |

**Deprecated/outdated for this phase:**
- `lib/jobs.ts` (Blob-backed `createJob`/`saveJob`/`listJobs`): legacy, superseded by Prisma. Do not use for batch creation.
- Direct `submitRunPod` from a batch action: belongs to Phase 4, not here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GPU cost constants (`gpuRatePerMinuteUsd 0.012`, `baseSecondsPerJob 25`, `secondsPerKSample 14`) | Code Examples / estimate.ts | Cost/time readout misleads operators; mitigated by config-not-hardcoded + "estimates vary" tooltip. Confirm real RunPod $/min with user. |
| A2 | SOFT_THRESHOLD=48, HARD_CAP=200 | Standard / Pitfalls | UI-SPEC labels these "recommended defaults … planner/REQUIREMENTS-driven." Values are the documented recommendation but not a locked REQUIREMENTS number — confirm. |
| A3 | Stone-type→material mapping (e.g. `pink_sapphire→sapphire`, `moissanite→diamond`, `amethyst→?`) | Pitfall 3 / binding.ts | A wrong/absent mapping yields a `material_map` the worker can't honor. Needs a decision: restrict picker to 4 mappable types, OR define a full 10→4 map. (Open Q2) |
| A4 | Camera view → angle is positional by sorted `CameraView.key` (view1→hero, view2→front, view3→top, view4→profile) | binding.ts | If Admin reorders/renames views, positional mapping could mislabel. UI-SPEC says "positional map"; confirm ordering key. (Open Q1) |
| A5 | Batch initial `status` string on create (`"draft"` then UI shows `queued`) | Pitfall 5 | Phase 4 consumes batch status; an inconsistent initial value confuses orchestration. (Open Q3) |
| A6 | Idempotency/duplicate-submit guard approach (client disables submit while in-flight; optional server dedupe) | Open Questions | A double-click could create two identical batches. Lightweight guard recommended; full idempotency key is optional. |

## Open Questions

1. **Camera-view → angle mapping when the domain has ≠4 views.**
   - What we know: seed has exactly 4 views (`view1..view4`); generator has exactly 4 angle keys; UI-SPEC says positional map and "read the live list."
   - What's unclear: behavior if an Admin adds a 5th view or deletes one.
   - Recommendation: For v1, map positionally over the first 4 sorted views; if >4, the planner restricts selectable angles to the 4 mapped ones (or the discuss-phase confirms an extension rule). Document the chosen rule in the plan.

2. **Stone-type catalog (10 seeded) → generator materials (4 supported).**
   - What we know: `StoneType` seed = diamond, black_diamond, moissanite, ruby, sapphire, pink_sapphire, emerald, amethyst, aquamarine, morganite. Generator supports diamond/sapphire/emerald/ruby only.
   - What's unclear: how to treat the other 6.
   - Recommendation: define an explicit `STONE_MATERIAL_MAP` in `binding.ts` (e.g. black_diamond/moissanite→diamond; pink_sapphire→sapphire; aquamarine/amethyst/morganite→? ). Simplest safe v1: restrict the stone-type picker to types that map, and validate server-side. **Decide in discuss/plan.**

3. **Initial `Batch.status` value.** `Job.status` is clearly `queued` (enum). `Batch.status` is a free string defaulting to `"draft"`. The UI-SPEC success pill says **queued**. Recommend the action set `Batch.status` to a value Phase 4 expects (e.g. `"queued"`) — confirm the batch-status vocabulary P4 will consume (UI-SPEC says P4 owns progression).

4. **Duplicate-submit / idempotency.** No idempotency key exists on `Batch`. Recommend (a) client disables submit during the in-flight action (UI-SPEC "submitting" state already requires this), and optionally (b) a short server-side guard. A full idempotency-key column is likely Phase 4 territory — confirm scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Postgres (DATABASE_URL) | Batch/Job writes | ✓ (Phase 1) | — | — (tests mock Prisma; integration needs live DB per Phase 1/2 gating) |
| Prisma client | All DB writes | ✓ | 6.19.2 | — |
| Node/Next dev | Builder + action | ✓ | Next ^15.1.4 | — |
| Vitest | Tests | ✓ | 4.1.8 | — |
| RunPod | **NOT required in Phase 3** | n/a | — | Phase 4 owns dispatch |
| Vercel Blob | **NOT required in Phase 3** | n/a | — | Phase 4/5 |

**Missing dependencies with no fallback:** none — all required infra shipped in Phase 1/2.
**Missing dependencies with fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation` is `true` (verified `.planning/config.json:19`). Section included. Reuses the Phase 1/2 Vitest harness — no Wave 0 framework install needed.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (already installed) |
| Config file | `vitest.config.ts` (exists; `vite-tsconfig-paths` resolves `@/*`) |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run` |

Mutations are Server Actions over Prisma; tests mock `prisma`, `@/lib/auth/rbac`, and `next/cache` exactly as `test/assignment-save.test.ts` and `test/user-admin.test.ts` do. No live RunPod/DB in unit tests. The estimate + binding modules are PURE — test them with zero mocks.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BATCH-01 | Builder offers multi-select over live `CameraView` list; ≥1 angle required | integration | `npx vitest run batch-builder-domain` | ❌ Wave 0 |
| BATCH-02 | Multi-select over the 3 `Metal` rows; ≥1 required | integration | `npx vitest run batch-builder-domain` | ❌ Wave 0 |
| BATCH-03 | One stone-type picker per stone group the product HAS (from assignment); type sets material not count | unit | `npx vitest run batch-expand` | ❌ Wave 0 |
| BATCH-04 | Pass set = metal-only + one holdout pass per selected present stone group | unit | `npx vitest run batch-expand` | ❌ Wave 0 |
| BATCH-05 | `jobCount = |angles|×|metals|×|passes|`; cost/time estimate from samples/res/config | unit | `npx vitest run batch-estimate` | ❌ Wave 0 |
| BATCH-06 | Cap edges: ≤SOFT safe, SOFT<n≤HARD warn, >HARD block; **server** rejects >HARD with no write; preview default | unit + integration | `npx vitest run batch-estimate batch-create` | ❌ Wave 0 |
| BATCH-07 | Submit → single `$transaction` creates Batch + N Jobs (combo+recipe, status=queued); recipe per combo from `buildEnterpriseRecipe`; all-or-none on failure; domain-key binding correct | integration | `npx vitest run batch-create batch-binding` | ❌ Wave 0 |
| (sec) | `requireSession` first; IDOR — operator can only build for an existing/own product | integration | `npx vitest run batch-create` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green + `npx tsc --noEmit` exit 0 + `npx next build` succeeds before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/batch-estimate.test.ts` — count math, cap-zone edges (47/48/49, 200/201), cost monotonic with samples; covers BATCH-05/06 (pure)
- [ ] `test/batch-binding.test.ts` — view→angle positional, red→rose, StoneType.key→material, unsupported-type rejection; covers BATCH-07 binding
- [ ] `test/batch-expand.test.ts` — cartesian combos, pass-set construction, `buildEnterpriseRecipe` called per combo with correct `groupTokens`/`stoneGroup`; covers BATCH-03/04/07
- [ ] `test/batch-create.test.ts` — `requireSession` first, IDOR (missing/other product → no write), **server cap** rejection, transactional all-or-none (throw mid-tx → no batch), Json casts; covers BATCH-06/07 + security
- [ ] (no framework install — Vitest harness, `test/setup.ts`, `test/factories.ts` reused from Phase 1/2)

*Manual-only:* the live estimate UX (debounce, zone color escalation, confirm dialog) and the success redirect to the (not-yet-existing) Phase 4 batch surface are visual/manual checks per the UI-SPEC.

## Security Domain

> `security_enforcement` not present in config — treat as enabled. Phase 3 is an authenticated internal mutation; the relevant controls are AuthZ, input validation, and resource-exhaustion (the cost cap).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireSession()` first line (NextAuth session) — reused |
| V3 Session Management | yes (inherited) | NextAuth JWT cookie (Phase 1) |
| V4 Access Control | yes | `requireSession`; **IDOR** — verify the product exists (single-tenant team, so ownership = existence + session, but still load-and-check, never trust the client `productId` blindly) |
| V5 Input Validation | yes | zod schema `lib/validation/batch.ts` (v3 idioms) for the selection payload before any write |
| V6 Cryptography | no | no crypto in this phase |
| V11 Business Logic / Anti-automation | **yes** | **Server-side hard-cap** on `jobCount` (BATCH-06) is the resource-exhaustion control — prevents a runaway-GPU-cost DoS-by-cost; never rely on the client gate |

### Known Threat Patterns for {Next.js Server Action + Prisma}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client bypasses cap → mass job creation (cost DoS) | Denial of Service (cost) | Recompute count server-side; reject `> HARD_CAP` before write |
| Crafted `productId` for a product the operator shouldn't batch | Elevation / Information disclosure (IDOR) | Load product in the action; reject if missing; (single-tenant ⇒ no per-user owner, but still validate existence + `status==ready`) |
| Malformed/oversized selection payload | Tampering | zod validation; cap array lengths; enum-validate keys |
| Injecting arbitrary recipe JSON via the action | Tampering | Never accept a recipe from the client — recipes are generated server-side by `buildEnterpriseRecipe` from validated keys only |
| Double-submit → duplicate batches | (integrity) | Disable submit in-flight (UI-SPEC submitting state) + optional server guard |

## Sources

### Primary (HIGH confidence — in-repo, verified this session)
- `lib/enterprise-recipes.ts` — `EnterpriseRecipeRequest` shape, `buildEnterpriseRecipe`, pass/visibility logic, supported materials (4), angle keys (4)
- `prisma/schema.prisma` — `Batch`/`Job`/`Layer` models, `JobStatus` enum, `ObjectGroupAssignment`, domain tables
- `lib/products/assignments.ts` — Phase 2→3 token bridge (objectTokens = signatures = recipe `contains`), `$transaction` array pattern, `requireSession` first
- `lib/products/inspection.ts` — `Prisma.InputJsonValue` Json-cast pattern, Server Action structure
- `lib/settings/actions.ts` — interactive `$transaction(async tx => …)` pattern (`saveStoneTypes`), `requireRole` + fail-closed translation
- `lib/auth/rbac.ts` — `requireSession`/`requireRole` (throw `Response`, fail-closed)
- `lib/runpod.ts` — confirms Phase 3 does NOT call RunPod (no batch caller)
- `lib/validation/{product,settings}.ts` — zod v3 schema conventions
- `prisma/seed.ts` — exact seeded domain (4 views, 3 metals incl. `red`, 10 stone types, 4 quality presets, 1920²)
- `test/assignment-save.test.ts`, `test/user-admin.test.ts`, `test/setup.ts`, `test/factories.ts`, `vitest.config.ts` — the mocking harness to mirror
- `.planning/phases/03-…/03-UI-SPEC.md` — binding table, thresholds (SOFT 48 / HARD 200), surfaces, job-count formula
- `.planning/REQUIREMENTS.md` — BATCH-01..07 wording; Phase 4 ORCH boundary
- `.planning/config.json` — `nyquist_validation: true`

### Secondary (MEDIUM confidence)
- `npm view @prisma/client version` → 7.8.0, `npm view zod version` → 4.4.3, `npm view vitest version` → 4.1.8 (registry latest; project pins differ deliberately)

### Tertiary (LOW confidence)
- GPU cost constants in the estimate model — `[ASSUMED]`, not verified RunPod pricing (Assumptions Log A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps verified in `package.json`; no new runtime deps
- Architecture / reuse: HIGH — `buildEnterpriseRecipe`, Prisma models, assignment bridge, transaction pattern all read directly from source
- Estimate/cost model: MEDIUM — formula structure is sound; the constants are ASSUMED placeholders pending user confirmation
- Binding (stone-type→material, view→angle): MEDIUM — mapping rule needs a decision (Open Q1, Q2)
- Pitfalls / validation: HIGH — drawn from actual in-repo patterns and the existing test harness

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable; in-repo reuse — only the open-question decisions and cost constants are volatile)
