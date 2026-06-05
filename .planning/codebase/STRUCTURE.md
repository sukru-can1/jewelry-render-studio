<!-- refreshed: 2026-06-05 -->
# Codebase Structure

**Analysis Date:** 2026-06-05

## Directory Layout

```
codex_render/
├── app/                          Next.js App Router — UI pages + API routes
│   ├── page.tsx                  Root route — renders <EnterpriseApp/>
│   ├── enterprise-app.tsx        Enterprise catalog matrix UI (production workflow)
│   ├── studio.tsx                Paste-a-recipe sandbox UI component
│   ├── default-recipe.json       Seed recipe shown in the Studio editor
│   ├── layout.tsx                Root HTML shell
│   ├── styles.css                Global styles
│   ├── lab/
│   │   └── page.tsx              /lab route — renders <Studio/>
│   ├── rater/
│   │   └── page.tsx              /rater route — live monitor + rating tournament
│   └── api/
│       ├── render-jobs/
│       │   ├── route.ts          POST submit job / GET list+refresh all jobs
│       │   └── [id]/
│       │       └── route.ts      GET single job with RunPod status refresh
│       ├── material-inspections/
│       │   └── route.ts          POST submit inspect_materials operation
│       ├── rating-sweeps/
│       │   └── route.ts          POST build + submit 5 next-gen recipe variants
│       ├── blob/
│       │   └── upload/
│       │       └── route.ts      POST grant client-upload token for large files
│       └── config/
│           └── route.ts          GET which env vars are configured
├── lib/
│   ├── types.ts                  RenderJob / BlobAsset TypeScript types
│   ├── jobs.ts                   Job CRUD over Vercel Blob (the "DB" layer)
│   ├── runpod.ts                 submitRunPod / getRunPodStatus
│   └── enterprise-recipes.ts    Deterministic recipe builder for matrix UI
├── workers/
│   └── runpod-blender/
│       ├── handler.py            RunPod serverless entry point
│       ├── render_scene.py       The renderer (~1100 lines) — recipe → Blender → PNG
│       ├── postprocess.py        Pillow post-processing pipeline
│       ├── inspect_materials.py  Material / mesh inventory extraction
│       ├── pod_render_once.py    One-shot non-serverless render path (env-var driven)
│       ├── Dockerfile            CUDA 12.4 + Blender image
│       └── requirements.txt      runpod, requests, vercel, Pillow
├── recipes/                      Curated catalog recipes (committed, hand-tuned)
│   ├── glamira_white_catalog.json
│   └── ring99_hybrid_catalog.json
├── scripts/                      Local R&D toolbox (~90 files, not deployed)
│   ├── blender_render.py         Local headless renderer (older sibling of render_scene.py)
│   ├── render_batch.py           Batch local renders + contact sheet assembly
│   ├── run_recipe_sweep.py       Submit recipe folder to RunPod, poll, collect results
│   ├── make_contact_sheet.py     Standalone contact sheet builder
│   ├── submit_runpod_render.py   Ad-hoc single-job RunPod submitter
│   ├── upload_blob_file.py       Upload a local file to Vercel Blob
│   ├── create_v143_*.py …        Recipe-sweep generators (v143–v203, the R&D diary)
│   ├── postprocess_*.py          Standalone Pillow experiments post-render
│   ├── import_*.mjs              Backfill finished local renders into Blob job DB
│   ├── create_runpod_endpoint.py RunPod/Docker ops scripts
│   ├── publish_runpod_worker.ps1 Build + push Docker image to registry
│   └── update_runpod_endpoint_blender5*.py/.mjs  Endpoint update helpers
├── blend/                        Local source .blend files (gitignored, large)
│   ├── ring99.blend              ~51 MB ring model
│   ├── son2.blend                ~51 MB son2 model (used by v153+ source-scene recipes)
│   └── 1scene.blend              ~171 MB complete studio scene
├── outputs/                      Local render history (mostly gitignored)
│   └── ring99/
│       ├── recipes/              Promoted recipe JSONs used as rating-sweep fallback base
│       └── postprod_*/           Local post-processing experiment outputs
├── docs/
│   ├── ARCHITECTURE.md           Comprehensive reference (source for .planning/codebase/)
│   ├── VERCEL_DEPLOYMENT.md      Vercel project setup notes
│   ├── MATERIALS.md              Object naming conventions and material mapping guide
│   └── RING99_NEXT_STEPS.md      Development notes and security warnings
├── external-work/
│   └── cloud-renderer-glmr/      Separate legacy Flask renderer (own nested .git)
│                                 Flask + SQLite + local Blender. NOT wired into the
│                                 live system. Reference only — describes holdout/
│                                 group-pass render logic that inspired enterprise passes.
├── apps/                         EMPTY scaffolding — apps/api/app and apps/web/src
│                                 are empty directories. Not part of the live system.
├── .github/
│   └── workflows/
│       └── runpod-worker-image.yml  CI: build + push Docker image to GHCR on
│                                    changes under workers/runpod-blender/**
├── .planning/
│   └── codebase/                 GSD codebase map documents
├── README.md
├── vercel.json                   Next.js framework pin; app/api/** capped at 60 s
├── next.config.ts                Minimal Next.js config
├── package.json                  Node dependencies (Next.js 15, React 19, @vercel/blob)
├── tsconfig.json
└── requirements.txt              Root: Pillow only (for local postprocess_*.py scripts)
```

## Directory Purposes

**`app/` — Next.js App Router:**
- Purpose: All UI pages (React client components) and all server-side API routes
- Contains: `.tsx` page components, `.ts` route handlers, `default-recipe.json`
- Key files: `app/enterprise-app.tsx` (production catalog UI), `app/studio.tsx` (sandbox UI), `app/rater/page.tsx` (rating UI), `app/api/render-jobs/route.ts` (primary API)

**`lib/` — Node.js helper layer:**
- Purpose: Reusable TypeScript functions used by API routes
- Contains: Job CRUD (`jobs.ts`), RunPod client (`runpod.ts`), recipe builder (`enterprise-recipes.ts`), shared types (`types.ts`)
- No React imports — safe to use in any Node.js context

**`workers/runpod-blender/` — GPU worker:**
- Purpose: The Docker image deployed to RunPod Serverless
- Contains: Python files only; packaged with Blender binary in Docker
- Key files: `handler.py` (entry point), `render_scene.py` (renderer), `postprocess.py` (Pillow)
- Deployed via: CI pushing to GHCR (`.github/workflows/runpod-worker-image.yml`) or manual `publish_runpod_worker.ps1`

**`recipes/` — Curated committed recipes:**
- Purpose: Known-good, hand-tuned recipe JSONs that are committed to the repo
- Contains: `*.json` recipe files
- Used by: Dashboard as starting points; referenced by scripts

**`scripts/` — Local R&D toolbox:**
- Purpose: Offline iteration — generate recipe variants, render locally or via RunPod sweep, build contact sheets, backfill results to Blob job DB
- Contains: Python and `.mjs` scripts; `~90` files
- NOT deployed; not part of the Vercel app

**`blend/` — Source .blend files:**
- Purpose: Local Blender scene files for the ring/son2 models
- Gitignored (large binaries); not present in fresh clone
- Used by: `scripts/render_batch.py`, local headless renders, source-scene recipes (v173+)

**`outputs/ring99/recipes/` — Promoted recipes:**
- Purpose: Recipes from specific sweep runs that were promoted as stable baselines
- Used by: `app/api/rating-sweeps/route.ts` as a fallback base recipe (hardcoded path — see CONCERNS)

**`docs/` — Documentation:**
- Purpose: Project knowledge base; `ARCHITECTURE.md` is the primary reference
- `MATERIALS.md` is essential reading for understanding object-name conventions

**`external-work/cloud-renderer-glmr/` — Legacy system:**
- A separately-gitted Flask renderer; not wired into the live system
- Contains its own `CLAUDE.md`, `app.py`, `worker.py`, `blender_scripts.py`, SQLite models
- Read for requirements history; do not modify or import from it

**`apps/` — Empty scaffolding:**
- `apps/api/app/` and `apps/web/src/` are empty. Not part of the live system.
- Safe to ignore entirely.

## Key File Locations

**Entry Points:**
- `app/page.tsx` — root route, renders EnterpriseApp
- `app/lab/page.tsx` — /lab route, renders Studio
- `app/rater/page.tsx` — /rater route, renders Rater
- `workers/runpod-blender/handler.py` — RunPod worker entry point

**Primary API:**
- `app/api/render-jobs/route.ts` — POST submit / GET list+refresh
- `app/api/render-jobs/[id]/route.ts` — GET single job

**Library / Business Logic:**
- `lib/jobs.ts` — Job CRUD (createJob, saveJob, getJob, listJobs)
- `lib/runpod.ts` — submitRunPod, getRunPodStatus
- `lib/enterprise-recipes.ts` — EnterpriseRecipeRequest builder
- `lib/types.ts` — RenderJob, BlobAsset type definitions

**Core Renderer:**
- `workers/runpod-blender/render_scene.py` — ~1100 lines; DEFAULT_RECIPE at line 15; main() at line 1021
- `workers/runpod-blender/postprocess.py` — Pillow pipeline
- `workers/runpod-blender/inspect_materials.py` — material inventory

**Configuration:**
- `vercel.json` — maxDuration 60 s for API routes
- `workers/runpod-blender/Dockerfile` — GPU worker image
- `.github/workflows/runpod-worker-image.yml` — CI for worker image
- `app/default-recipe.json` — seed recipe for Studio editor

**Reference Recipes:**
- `recipes/ring99_hybrid_catalog.json` — a real heavily-tuned hybrid recipe
- `recipes/glamira_white_catalog.json` — catalog white gold recipe
- `app/default-recipe.json` — editor seed

**Documentation:**
- `docs/ARCHITECTURE.md` — comprehensive project reference (read first)
- `docs/MATERIALS.md` — object naming conventions and material mapping

## Naming Conventions

**Recipe version files (`scripts/create_vNNN_*.py`):**
- Pattern: `create_v<number>_<descriptive_slug>.py`
- Examples: `create_v143_original_product_sweep.py`, `create_v173_source_scene_recipes.py`, `create_v203_close_pose_angle_set.py`
- The `vNNN` number is a monotonically increasing R&D iteration counter, not a semantic version

**Recipe JSON files:**
- Pattern: `v<NNN><letter>_<slug>.json` for sweep variants (e.g. `v144b_texture.json`)
- Pattern: `<descriptive_name>.json` for promoted committed recipes (e.g. `ring99_hybrid_catalog.json`)

**Object name tokens (critical — these drive all matching):**
- Metal objects: `band_metal`, `prong_*`, `basket_*`, `shank_*`
- Center stone: `center_diamond`, `center_stone`, `Round_5`
- Side/accent stones: `stone2`, `stone3`, `side`, `pave`, `Round_<N>`
- Enterprise groups: `alloycolour` (metal objects), `diamond`, `stone2`, `stone3`
- Avoid: `Object001`, `Material.003` — these break `object_signature` matching

**TypeScript files:**
- camelCase for functions and variables
- PascalCase for types and React components
- Files: `kebab-case.ts` for non-component files, `PascalCase.tsx` for components in `app/`

**Python files:**
- snake_case throughout
- Worker files: flat names in `workers/runpod-blender/` (no subdirectories)
- Script files: prefix `create_`, `postprocess_`, `import_`, `run_`, etc. for discoverability

**API routes:**
- Kebab-case directory names matching URL segments: `render-jobs`, `material-inspections`, `rating-sweeps`, `blob/upload`
- Dynamic segments: `[id]`

## Where to Add New Code

**New UI surface (new render workflow):**
- Add a `.tsx` component in `app/` (e.g. `app/my-feature.tsx`)
- Add a route in `app/<route-name>/page.tsx`
- Follow the Enterprise/Studio pattern: the page is a thin wrapper that renders the component

**New API endpoint:**
- Add `app/api/<endpoint-name>/route.ts`
- Always include at the top: `export const runtime = "nodejs"; export const maxDuration = 60;`
- Import job/runpod helpers from `lib/`

**New library helper:**
- Add to `lib/` as a standalone `.ts` file
- Keep it free of React imports
- Export named functions (no default exports)

**New recipe preset (material or camera angle):**
- Add metal/stone presets to `lib/enterprise-recipes.ts` `METAL_PRESETS` or `STONE_PRESETS` objects
- Add camera angles to `lib/enterprise-recipes.ts` `ANGLES` object
- Add a committed recipe JSON to `recipes/`

**New worker operation:**
- Add the operation branch in `workers/runpod-blender/handler.py` (after `inspect_materials` pattern, line ~99)
- Add corresponding Python script in `workers/runpod-blender/`
- Rebuild and push the Docker image

**New render feature (recipe section):**
- Add the key to `DEFAULT_RECIPE` in `workers/runpod-blender/render_scene.py:15`
- Add the handling function in `render_scene.py` (follow existing `add_*` / `setup_*` naming)
- Call it from `main()` in the correct order (after materials, before render)
- Update `app/default-recipe.json` with the new section if it should appear in the Studio editor

**New local iteration script:**
- Add to `scripts/` with appropriate prefix: `create_v<NNN+1>_<slug>.py`, `postprocess_<slug>.py`, `import_<slug>.mjs`
- Follow the vNNN naming convention to maintain the R&D diary

**New documentation:**
- Add to `docs/` as `UPPERCASE.md` or `Topic_Name.md`
- Update `docs/ARCHITECTURE.md` if the change affects the overall system design

## Special Directories

**`blend/`:**
- Purpose: Source `.blend` Blender scene files used for rendering
- Generated: No (hand-crafted or exported from Blender)
- Committed: No (gitignored — files are 51–171 MB)
- Note: Must be obtained separately for local development

**`outputs/`:**
- Purpose: Local render outputs from `scripts/render_batch.py` and sweep runs
- Generated: Yes (by render scripts)
- Committed: Partially — `outputs/ring99/recipes/` contains promoted recipe JSONs that are committed; rendered PNGs and bulk outputs are gitignored

**`models/` (Vercel Blob path, not a local directory):**
- Purpose: Uploaded model files (GLB/FBX/BLEND etc.) stored in Vercel Blob
- Location in Blob: `models/<filename>`
- Local: Not present (browser uploads directly to Blob via client-upload token from `app/api/blob/upload`)

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (gitignored)

**`scripts/__pycache__/`:**
- Purpose: Python bytecode cache
- Generated: Yes
- Committed: No (gitignored)

---

*Structure analysis: 2026-06-05*
