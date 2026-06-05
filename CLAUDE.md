<!-- GSD:project-start source:PROJECT.md -->
## Project

**Jewelry Render Studio — Enterprise**

An internal, enterprise-grade web application for Glamira's rendering team to turn 3D jewelry models into photorealistic catalog imagery at scale. Operators upload a product model, classify its parts into metal/stone groups, then build a render batch that fans out across camera angles, metal colors, gemstone types, and layered holdout passes. Jobs render on RunPod GPU workers using the existing Blender/Cycles recipe engine; the app organizes the layered outputs, composites them, and produces catalog-ready deliverables. It replaces the current open, single-purpose dashboard with a multi-user, role-based, database-backed product.

This is a **new product layer (UI + hardened backend) built on top of the existing, proven render pipeline** (RunPod + Blender + the JSON "recipe" system). The GPU/render engine is reused, not rebuilt.

**Core Value:** An operator can take one jewelry model and reliably produce the full set of catalog images — every angle × metal × stone variant, in correctly separated metal/stone layers — without touching Blender or hand-editing recipes.

### Constraints

- **Tech stack**: Next.js 15 App Router + React 19 + TypeScript (keep). Add Postgres + Prisma for structured state. Keep Vercel Blob for binary assets (models, renders). Keep RunPod + Blender worker + recipe engine.
- **Hosting**: Vercel (web/API) + RunPod (GPU). Vercel functions cap at 60s — long renders stay async via RunPod with status polling/updates.
- **UI**: Built with the `ui-ux-pro-max` skill. Vercel/Notion/RunPod design influence; functional and cutting-edge; **no purple**.
- **Auth**: Internal team, accounts + roles (Admin, Operator), single tenant.
- **Domain fidelity**: Default angles/metals/groups/quality must match the rendering team's encoded settings (above), and remain editable by Admins.
- **Deploy target**: `sukrus-projects-1b84f634/jewelry-render-studio`.
- **Secrets**: No secrets committed; the previously-exposed RunPod key should be rotated.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7 — Next.js web app, API routes, shared lib (`*.ts`, `*.tsx` under `app/`, `lib/`)
- Python 3 (system Python in Ubuntu 22.04 container) — GPU worker (`workers/runpod-blender/`), local iteration scripts (`scripts/`)
- JavaScript (auto-generated `.js` build artifacts) — not authored directly
## Two-Runtime Architecture
| Runtime | Location | Deployment |
|---------|----------|------------|
| TypeScript / Node.js | `app/`, `lib/` | Vercel (Edge/Node.js functions) |
| Python 3 + Blender | `workers/runpod-blender/` | RunPod serverless GPU container |
## Runtime
- Node.js (managed by Vercel; target ES2017 output per `tsconfig.json`)
- No `.nvmrc` or `.node-version` present — version is pinned by Vercel platform
- Python 3 (system `python3` in `nvidia/cuda:12.4.1-runtime-ubuntu22.04`)
- Blender 4.3.2 (downloaded from blender.org at image build time, installed to `/opt/blender/`)
- npm (web) — `package.json` present, lockfile: not detected in repo (likely gitignored)
- pip (worker) — `workers/runpod-blender/requirements.txt`
## Frameworks
- Next.js `^15.1.4` — App Router, server components, API routes
- React `^19.0.0` / react-dom `^19.0.0` — UI rendering
- TypeScript `^5.7.2` — strict mode enabled (`tsconfig.json`)
- `next dev` / `next build` / `next start` (scripts in `package.json`)
- No test framework detected
## Key Dependencies
- `@vercel/blob ^1.0.2` — All file storage AND job-state persistence (no database)
- `next ^15.1.4` — Full-stack framework; API routes in `app/api/`
- `react ^19.0.0` — UI
- `runpod==1.7.7` — RunPod serverless SDK; entrypoint via `runpod.serverless.start()` in `workers/runpod-blender/handler.py`
- `requests==2.32.3` — HTTP downloads (model assets, blob URLs)
- `vercel==<latest>` — Vercel Blob Python SDK; used in `workers/runpod-blender/handler.py` via `vercel.blob.BlobClient`
- `Pillow==10.4.0` — Post-processing rendered images in `workers/runpod-blender/postprocess.py`
- `lucide-react ^0.468.0` — Icon library
- `@types/node ^22.10.5`
- `@types/react ^19.0.4`
- `@types/react-dom ^19.0.2`
- `Pillow>=10.0` — Image inspection utilities in `scripts/`
## Blender
## Configuration
- `RUNPOD_API_KEY` — RunPod Bearer token
- `RUNPOD_ENDPOINT_ID` — RunPod serverless endpoint ID
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob read/write token
- `BLOB_PUBLIC_BASE_URL` — Optional; enables direct URL fetch for job state instead of `blob.list()`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob write access for render output upload
- `BLOB_ACCESS` — Blob access level; defaults to `"public"` (`workers/runpod-blender/handler.py:55`)
- `BLENDER_TIMEOUT_SECONDS` — Blender subprocess timeout; defaults to `1800` (30 min) (`workers/runpod-blender/handler.py:74`)
- `next.config.ts` — minimal; `typedRoutes: false`
- `tsconfig.json` — strict TypeScript, `moduleResolution: bundler`, path alias `@/*` → `./*`
- `vercel.json` — framework: `nextjs`; all `app/api/**/*.ts` routes get `maxDuration: 60`
## Platform Requirements
- Node.js (any version compatible with Next.js 15)
- `npm install && npm run dev`
- Python 3 + Pillow for running local `scripts/`
- Web: Vercel (auto-deploy on git push; project ID `prj_I3y70TPePBfjGvxgjryDncHeSGVe`)
- Worker: RunPod serverless GPU — Docker image built via GitHub Actions CI, pushed to GHCR (`ghcr.io/<owner>/jewelry-render-worker`)
## Container (Worker)
## Legacy / Reference Only
- Flask + Flask-SQLAlchemy + SQLite (`models.py`) — local web server
- Blender 4.2.0 (legacy version vs. 4.3.2 in production)
- `trimesh` — OBJ→GLB preview generation
- RunPod SDK — cloud dispatch (endpoint `4lvi3w848rqy0l`)
- GitHub Actions → `ghcr.io/muge93/jewelry-render:latest`
- **Do not modify or depend on this directory** — it is reference/copied legacy code only
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## TypeScript / Next.js Layer
### Naming Patterns
- Route handlers: `app/api/<resource>/route.ts` — flat kebab-case segments, dynamic segments use `[id]` brackets
- React page components: `app/<page>/page.tsx` (Next.js App Router convention)
- Large client-side app components live as `app/<name>-app.tsx` or `app/<name>.tsx` (e.g., `app/studio.tsx`, `app/enterprise-app.tsx`)
- Lib modules: `lib/<noun>.ts` in camelCase (e.g., `lib/jobs.ts`, `lib/runpod.ts`, `lib/types.ts`, `lib/enterprise-recipes.ts`)
- camelCase for all functions: `createJob`, `saveJob`, `submitRunPod`, `getRunPodStatus`, `buildEnterpriseRecipe`
- Private helper functions within a file are unexported and lower-camelCase: `slug()`, `tokensFor()`, `uniqueTokens()`, `buildVisibility()`
- React components: PascalCase (`RenderRater`, `RootLayout`)
- camelCase for local variables and function parameters
- SCREAMING_SNAKE_CASE for module-level constants: `JOB_PREFIX`, `METAL_PRESETS`, `STONE_PRESETS`, `ANGLES`, `FALLBACK_TOKENS`
- PascalCase type aliases and exported types: `BlobAsset`, `RenderJob`, `EnterpriseRecipeRequest`, `EnterpriseAngleKey`
- Discriminated union literals for domain values: `"hero" | "front" | "top" | "profile"`, `"full" | "metal" | "stone"`
- `Record<string, unknown>` is the canonical type for open-ended recipe/config objects (used in `lib/types.ts`, every route handler body, and all recipe builder return types)
### Route Handler Conventions
- Success: `NextResponse.json(payload)` — no explicit status (defaults to 200)
- Not found: `NextResponse.json({ error: "..." }, { status: 404 })`
- Client error: `NextResponse.json({ error: "..." }, { status: 400 })`
- Server error: `NextResponse.json({ error: "..." }, { status: 500 })`
- The error shape is always `{ error: string }` — never nested or differently keyed
### Path Aliases
### TypeScript Strictness
### Recipe Typing
### React Component Style
### Async Data Fetching in Routes
## Python Layer
### Naming Patterns
- snake_case everywhere: `render_scene.py`, `inspect_materials.py`, `postprocess.py`, `handler.py`
- Recipe-generating scripts: `create_vNNN_<description>.py` — monotonically increasing version number prefix (e.g., `scripts/create_v203_close_pose_angle_set.py`)
- Postprocess experiment scripts: `postprocess_<variant>.py` (e.g., `scripts/postprocess_diamond_variants.py`)
- snake_case: `deep_merge`, `clear_scene`, `import_model`, `object_signature`, `assign_materials`, `apply_postprocess`
- Private helpers prefixed with `_`: `_clamp`, `_object_bounds`, `_fallback_bounds`, `_object_bounds_mask` (in `workers/runpod-blender/postprocess.py`)
- snake_case for locals and parameters
- SCREAMING_SNAKE_CASE for module-level constants: `DEFAULT_RECIPE`, `WORKER_DIR`, `BLENDER_SCRIPT`, `ROOT`, `BASE_PATH`, `PRODUCT_TOKENS`
### Blender Script Argument Parsing
### DEFAULT_RECIPE + deep_merge Pattern
### object_signature() Token Matching
### Config-as-Data Recipe Architecture
### Python Module Conventions
- All worker Python files begin with `from __future__ import annotations` for forward reference support
- `Path` from `pathlib` is used for all filesystem operations — no raw string concatenation for paths
- `json.loads` / `json.dumps` with `indent=2` for all recipe serialization
- Error returns from the RunPod handler are plain dicts: `{"error": "...", "stdout": "...", "stderr": "..."}` — not exceptions
### Postprocess Pipeline (postprocess.py)
## Shared Conventions Across Both Layers
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| Enterprise UI | Catalog matrix: upload → inspect → assign groups → submit batch | `app/enterprise-app.tsx` |
| Studio/Lab UI | Paste-recipe sandbox, single/sweep renders, inspection | `app/studio.tsx`, `app/lab/page.tsx` |
| Rater UI | Live render monitor, rating tournament, next-gen recipe generation | `app/rater/page.tsx` |
| render-jobs API | POST create+submit job; GET list+refresh all jobs from RunPod | `app/api/render-jobs/route.ts` |
| render-jobs/[id] API | GET single job with RunPod status refresh | `app/api/render-jobs/[id]/route.ts` |
| material-inspections API | POST submit inspect_materials operation to RunPod | `app/api/material-inspections/route.ts` |
| rating-sweeps API | POST build 5 jittered exploration recipes and submit them | `app/api/rating-sweeps/route.ts` |
| blob/upload API | POST grant client-upload token for large model files | `app/api/blob/upload/route.ts` |
| config API | GET report which env vars are present | `app/api/config/route.ts` |
| jobs.ts | createJob / saveJob / getJob / listJobs over Vercel Blob | `lib/jobs.ts` |
| runpod.ts | submitRunPod (POST /run) / getRunPodStatus (GET /status/:id) | `lib/runpod.ts` |
| enterprise-recipes.ts | Deterministically build recipe per metal × angle × pass combination | `lib/enterprise-recipes.ts` |
| handler.py | Download model, dispatch to render or inspect, upload results to Blob | `workers/runpod-blender/handler.py` |
| render_scene.py | Merge recipe over DEFAULT_RECIPE, build full Blender scene, render PNG, write metadata | `workers/runpod-blender/render_scene.py` |
| postprocess.py | Pillow pipeline: background, product, stone, symmetry, facet passes | `workers/runpod-blender/postprocess.py` |
## Pattern Overview
- No traditional database. Job state = JSON blobs under `app-state/render-jobs/` in Vercel Blob; listing jobs = `list()` + lazy RunPod status refresh on GET.
- The web/API layer never renders locally. It uploads assets to Blob, submits to RunPod, polls, and displays results.
- Object name substrings are the matching API. Everything — material assignment, transforms, filtering, post-process targeting — works via `contains` tokens matched against `object_signature(obj)` = lowercased `"<object name> <material names>"`.
- All API routes are `runtime = "nodejs"`, `maxDuration = 60` (set in `vercel.json` and per-route exports).
## Layers
- Purpose: React client components — the three render surfaces
- Location: `app/enterprise-app.tsx`, `app/studio.tsx`, `app/lab/page.tsx`, `app/rater/page.tsx`
- Contains: React components, form state, polling loops, results display
- Depends on: API routes via `fetch`
- Used by: End users
- Purpose: Next.js App Router API handlers; bridge between UI and lib/Blob/RunPod
- Location: `app/api/**`
- Contains: Route handlers, request parsing, error formatting
- Depends on: `lib/jobs.ts`, `lib/runpod.ts`, `lib/enterprise-recipes.ts`
- Used by: UI layer
- Purpose: Reusable Node.js helpers for job management, RunPod calls, and recipe building
- Location: `lib/jobs.ts`, `lib/runpod.ts`, `lib/enterprise-recipes.ts`, `lib/types.ts`
- Contains: Pure functions; no React imports
- Depends on: `@vercel/blob`, env vars (`RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `BLOB_READ_WRITE_TOKEN`)
- Used by: API route layer
- Purpose: Durable object store acting as the database and CDN for assets
- Paths: `app-state/render-jobs/<id>.json`, `outputs/<model>/<id>/`, `models/`, `material-inspections/`
- Used by: lib layer (write), RunPod worker (write), UI (read via public URLs)
- Purpose: Blender render execution on RunPod serverless GPU
- Location: `workers/runpod-blender/`
- Contains: Python — handler, renderer, post-processor, inspector
- Depends on: Vercel Blob (model download + result upload), Blender binary in Docker image
- Used by: RunPod infrastructure, triggered via RunPod API
## Data Flow
### Primary Render Request Path
### Material Inspection Path
### Rating-Sweep (Human-in-the-Loop) Path
- Server-side: Vercel Blob JSON blobs (`app-state/render-jobs/<id>.json`)
- Client-side: React component state + polling (no global store)
- Status refreshed lazily on GET — `listJobs()` reads all blobs then fetches RunPod status for each non-terminal job
## Key Abstractions
- Purpose: Complete description of a Blender studio scene — the single source of truth for a render
- Examples: `recipes/ring99_hybrid_catalog.json`, `app/default-recipe.json`, generated programmatically by `lib/enterprise-recipes.ts`
- Pattern: Recipes are merged over `DEFAULT_RECIPE` via `deep_merge()` (`render_scene.py:105`). Only fields that differ from defaults need to be specified. Key top-level sections: `render`, `camera`, `world`, `background`, `model`, `material_strategy`, `material_map`, `materials`, `lights`, `reflection_cards`, `contact_shadows`, `facet_overlay`, `source_scene`, `postprocess`.
- Purpose: The universal matching key for all name-based routing in the worker
- Definition: lowercased `"<object name> <space-joined material names>"` — see `render_scene.py:334`
- Used by: `material_map` `contains` matching, `filter_product_objects`, `apply_object_transforms`, `shade_smooth_exclude_contains`, `facet_overlay.object_contains`, source_scene group/object adjustments, post-process targeting
- Convention: Use predictable mesh names (`band_metal`, `center_diamond`, `Round_5`, `prong_*`) — avoid `Object001` / `Material.003`
- Purpose: Controls whether embedded model materials are kept, replaced, or partially replaced
- Values:
- Location: `render_scene.py` `assign_materials()` function
- Real catalog recipes use `hybrid` (see `recipes/ring99_hybrid_catalog.json`)
- Purpose: The persisted record of a render request and its outcome
- Fields: `id`, `status`, `runpodJobId`, `model` (BlobAsset), `referenceImage`, `recipe`, `outputPrefix`, `createdAt`, `updatedAt`, `result`, `error`
- Type definition: `lib/types.ts:7`
- Persistence: `lib/jobs.ts` — `saveJob` writes to Blob with `allowOverwrite: true`; `listJobs` does `list({prefix: "app-state/render-jobs/"})` and fetches each blob
- Purpose: Per-object image-space bounding boxes computed after render; consumed by `postprocess.py` to target regions
- Computed by: `render_scene.py:976` `object_image_bounds()` using `world_to_camera_view` projection
- Format: `{name, materials, signature, bounds_norm: [x0,y0,x1,y1], bounds_px: [...]}`
- Purpose: Deterministic recipe builder for the catalog workflow
- Location: `lib/enterprise-recipes.ts`
- Pattern: One recipe per `metal × angle × pass` combination (e.g. 3 metals × 4 angles × 3 passes = 36 jobs)
- Named: `enterprise_<product>_<pass>_<metal>_<stoneGroup>_<angle>`
- Passes: `full` (all objects), `metal` (only metal objects visible), `stone` (only stone objects visible) — carrying over the holdout/grouping concept from the legacy Flask renderer
## Entry Points
- Location: `app/page.tsx` (renders `<EnterpriseApp/>`) and `app/lab/page.tsx` (renders `<Studio/>`)
- Triggers: HTTP requests to Vercel deployment
- Location: `app/api/render-jobs/route.ts`
- Triggers: POST from UI to submit a render; GET from UI to poll status
- Location: `workers/runpod-blender/handler.py:78` (`handler(job)`)
- Triggers: RunPod serverless invocation when a job is dispatched
- Responsibilities: Download model, dispatch to render or inspect, upload results, return URLs
- Location: `workers/runpod-blender/render_scene.py:1021` (`main()`)
- Triggers: `blender --background --python render_scene.py -- --model … --recipe … --output … --metadata …`
## Render Pipelines in render_scene.py
### Pipeline 1 — Standard Import (default)
### Pipeline 2 — Source Scene (source_scene.enabled = true)
## Post-Processing Pipeline (postprocess.py)
## Architectural Constraints
- **Threading:** Single-threaded event loop (Next.js / Node.js); no background workers in the web process. GPU work runs on RunPod, polled lazily.
- **Global state:** `DEFAULT_RECIPE` dict at module level in `render_scene.py:15` — read-only; never mutated. No shared mutable state in lib/.
- **No DB schema migrations:** Job records are schemaless JSON blobs; field additions are additive and backward-compatible.
- **Blob as DB:** Listing all jobs = `list({prefix: "app-state/render-jobs/"}, limit: 1000)` in `lib/jobs.ts:64` — at scale this could become a bottleneck but is adequate for current volume.
- **Blender version dependency:** Worker Docker image pins a specific Blender binary. v153+ recipes assume Blender 5 features on `son2` model; v143–v152 were on Blender 4.
## Anti-Patterns
### Hardcoded Fallback Recipe Path
### `apps/` Empty Scaffolding
## Error Handling
- `handler.py` returns `{"error": "…", "stdout": last_4000_chars, "stderr": last_4000_chars}` on non-zero Blender exit code
- API routes return `NextResponse.json({error: message}, {status: 500})` on exceptions
- Job `status` field progresses: `queued` → `submitted` → RunPod statuses (`IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`)
- `job.error` string is set from `status.error || status.output` on FAILED
- `BLENDER_TIMEOUT_SECONDS` (default 1800) enforced by `subprocess.run(timeout=…)` in `handler.py:74`
## Cross-Cutting Concerns
## External Legacy System (external-work/cloud-renderer-glmr/)
- **Holdout / group passes:** The legacy Flask renderer produced layered output — metal as JPEG + each stone group as a transparent PNG for compositing. This idea lives on as the `full` / `metal` / `stone` passes in `lib/enterprise-recipes.ts`.
- **Master scene + script generator:** `blender_scripts.py` generated Blender Python as a string. The main project replaced this with the declarative recipe JSON + `render_scene.py` interpreter.
- **Material library:** 193-material `MyMaterials.blend` append-based system. Main project replaces this with inline recipe material presets and `adjust_source_material()` node-graph edits.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
