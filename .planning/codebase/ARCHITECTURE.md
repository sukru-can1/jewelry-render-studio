<!-- refreshed: 2026-06-05 -->
# Architecture

**Analysis Date:** 2026-06-05

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js Dashboard on Vercel  (app/)                                 │
│    Enterprise  app/enterprise-app.tsx  – catalog matrix UI           │
│    Studio/Lab  app/studio.tsx          – paste-a-recipe sandbox      │
│    Rater        app/rater/page.tsx     – live monitor + tournament   │
└───────────────┬──────────────────────────────────────────────────────┘
                │  Vercel API routes  app/api/**  (Node.js, 60 s max)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  lib/  (Node.js helper layer)                                        │
│    jobs.ts           – RenderJob CRUD over Vercel Blob               │
│    runpod.ts         – submitRunPod / getRunPodStatus                │
│    enterprise-recipes.ts – deterministic recipe builder              │
│    types.ts          – RenderJob / BlobAsset types                   │
└───────────────┬──────────────────────────────────────────────────────┘
                │  Vercel Blob (@vercel/blob)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Vercel Blob (the "database")                                        │
│    app-state/render-jobs/<id>.json   job records                     │
│    models/              uploaded GLB / FBX / BLEND / OBJ / STL      │
│    outputs/<model>/<id>/  rendered PNGs + metadata.json             │
│    material-inspections/  inventory JSON                             │
└───────────────┬──────────────────────────────────────────────────────┘
                │  POST https://api.runpod.ai/v2/<endpoint>/run
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RunPod Serverless GPU worker  workers/runpod-blender/               │
│    handler.py        – RunPod entry point, downloads model, dispatches│
│    render_scene.py   – THE renderer (~1100 lines, recipe → PNG)      │
│    postprocess.py    – Pillow post-processing pipeline               │
│    inspect_materials.py  – material inventory extraction             │
│    pod_render_once.py    – one-shot non-serverless render path       │
└──────────────────────────────────────────────────────────────────────┘
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

**Overall:** Recipe-driven rendering — the entire studio look is a JSON document that is merged over defaults, versioned, swept, and generated programmatically. Geometry is fixed; only the recipe changes to produce catalog variants.

**Key Characteristics:**
- No traditional database. Job state = JSON blobs under `app-state/render-jobs/` in Vercel Blob; listing jobs = `list()` + lazy RunPod status refresh on GET.
- The web/API layer never renders locally. It uploads assets to Blob, submits to RunPod, polls, and displays results.
- Object name substrings are the matching API. Everything — material assignment, transforms, filtering, post-process targeting — works via `contains` tokens matched against `object_signature(obj)` = lowercased `"<object name> <material names>"`.
- All API routes are `runtime = "nodejs"`, `maxDuration = 60` (set in `vercel.json` and per-route exports).

## Layers

**UI Layer:**
- Purpose: React client components — the three render surfaces
- Location: `app/enterprise-app.tsx`, `app/studio.tsx`, `app/lab/page.tsx`, `app/rater/page.tsx`
- Contains: React components, form state, polling loops, results display
- Depends on: API routes via `fetch`
- Used by: End users

**API Route Layer:**
- Purpose: Next.js App Router API handlers; bridge between UI and lib/Blob/RunPod
- Location: `app/api/**`
- Contains: Route handlers, request parsing, error formatting
- Depends on: `lib/jobs.ts`, `lib/runpod.ts`, `lib/enterprise-recipes.ts`
- Used by: UI layer

**Library Layer:**
- Purpose: Reusable Node.js helpers for job management, RunPod calls, and recipe building
- Location: `lib/jobs.ts`, `lib/runpod.ts`, `lib/enterprise-recipes.ts`, `lib/types.ts`
- Contains: Pure functions; no React imports
- Depends on: `@vercel/blob`, env vars (`RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `BLOB_READ_WRITE_TOKEN`)
- Used by: API route layer

**Storage Layer (Vercel Blob):**
- Purpose: Durable object store acting as the database and CDN for assets
- Paths: `app-state/render-jobs/<id>.json`, `outputs/<model>/<id>/`, `models/`, `material-inspections/`
- Used by: lib layer (write), RunPod worker (write), UI (read via public URLs)

**GPU Worker:**
- Purpose: Blender render execution on RunPod serverless GPU
- Location: `workers/runpod-blender/`
- Contains: Python — handler, renderer, post-processor, inspector
- Depends on: Vercel Blob (model download + result upload), Blender binary in Docker image
- Used by: RunPod infrastructure, triggered via RunPod API

## Data Flow

### Primary Render Request Path

1. User configures recipe in UI (`app/enterprise-app.tsx` or `app/studio.tsx`)
2. POST `app/api/render-jobs/route.ts` — `createJob()` builds a `RenderJob` with `status=queued`, UUID id, `outputPrefix=outputs/<model>/<id>`
3. `saveJob(job)` → writes `app-state/render-jobs/<id>.json` to Vercel Blob
4. `submitRunPod({operation:"render", job_id, model, recipe, output:{provider:"vercel_blob", prefix, access}})` → POST to `https://api.runpod.ai/v2/<endpointId>/run` (`lib/runpod.ts:7`)
5. RunPod response `.id` saved as `job.runpodJobId`, `status=submitted`; `saveJob(job)` again
6. Worker `handler.py:78` receives `job["input"]`, downloads model to tempdir, writes `recipe.json`
7. Shells out: `blender --background --python render_scene.py -- --model … --recipe … --output render.png --metadata metadata.json`
8. `render_scene.py:main()` merges recipe over `DEFAULT_RECIPE` (`render_scene.py:1023`), runs chosen pipeline, renders PNG, writes `metadata.json` with `object_image_bounds`
9. `handler.py:177` calls `apply_postprocess(render_path, metadata, recipe)` (Pillow)
10. Uploads `<prefix>/<id>.png` and `<prefix>/<id>.json` to Vercel Blob; returns `image_url` / `metadata_url`
11. UI polls GET `app/api/render-jobs` → `getRunPodStatus(runpodJobId)` refreshes each in-flight job and `saveJob` re-persists
12. When status reaches `COMPLETED`, `job.result` contains Blob URLs; UI renders the image

### Material Inspection Path

1. POST `app/api/material-inspections/route.ts` → `submitRunPod({operation:"inspect_materials", …})`
2. `handler.py:99` shells out: `blender --background --python inspect_materials.py -- --model … --output material_inventory.json`
3. `inspect_materials.py` imports model, emits per-object material names, Principled BSDF values, node types
4. `handler.py:131` uploads inventory JSON to Blob; returns `inventory_url`
5. Enterprise UI uses inventory to classify detected meshes into `alloycolour` / `diamond` / `stone2` / `stone3` groups

### Rating-Sweep (Human-in-the-Loop) Path

1. User rates candidates in `app/rater/page.tsx`
2. POST `app/api/rating-sweeps/route.ts` — scores candidates, selects winner (explicit or highest-scoring)
3. Uses winner's recipe (or fallback `outputs/ring99/recipes/v144b_…json`) as base
4. Emits 5 jittered variants: `explore_dark_studio`, `explore_soft_photo`, `explore_diamond_fire`, `explore_clean_bright`, `explore_contact_shadow`
5. All five submitted to RunPod in batch; job records saved to Blob

**State Management:**
- Server-side: Vercel Blob JSON blobs (`app-state/render-jobs/<id>.json`)
- Client-side: React component state + polling (no global store)
- Status refreshed lazily on GET — `listJobs()` reads all blobs then fetches RunPod status for each non-terminal job

## Key Abstractions

**Recipe (JSON object):**
- Purpose: Complete description of a Blender studio scene — the single source of truth for a render
- Examples: `recipes/ring99_hybrid_catalog.json`, `app/default-recipe.json`, generated programmatically by `lib/enterprise-recipes.ts`
- Pattern: Recipes are merged over `DEFAULT_RECIPE` via `deep_merge()` (`render_scene.py:105`). Only fields that differ from defaults need to be specified. Key top-level sections: `render`, `camera`, `world`, `background`, `model`, `material_strategy`, `material_map`, `materials`, `lights`, `reflection_cards`, `contact_shadows`, `facet_overlay`, `source_scene`, `postprocess`.

**object_signature:**
- Purpose: The universal matching key for all name-based routing in the worker
- Definition: lowercased `"<object name> <space-joined material names>"` — see `render_scene.py:334`
- Used by: `material_map` `contains` matching, `filter_product_objects`, `apply_object_transforms`, `shade_smooth_exclude_contains`, `facet_overlay.object_contains`, source_scene group/object adjustments, post-process targeting
- Convention: Use predictable mesh names (`band_metal`, `center_diamond`, `Round_5`, `prong_*`) — avoid `Object001` / `Material.003`

**material_strategy:**
- Purpose: Controls whether embedded model materials are kept, replaced, or partially replaced
- Values:
  - `override` (default) — replace all matched materials with recipe presets
  - `source` — keep all embedded materials as-is
  - `hybrid` — replace only objects matched by `material_map`; keep unmatched objects' embedded materials
- Location: `render_scene.py` `assign_materials()` function
- Real catalog recipes use `hybrid` (see `recipes/ring99_hybrid_catalog.json`)

**RenderJob:**
- Purpose: The persisted record of a render request and its outcome
- Fields: `id`, `status`, `runpodJobId`, `model` (BlobAsset), `referenceImage`, `recipe`, `outputPrefix`, `createdAt`, `updatedAt`, `result`, `error`
- Type definition: `lib/types.ts:7`
- Persistence: `lib/jobs.ts` — `saveJob` writes to Blob with `allowOverwrite: true`; `listJobs` does `list({prefix: "app-state/render-jobs/"})` and fetches each blob

**object_image_bounds:**
- Purpose: Per-object image-space bounding boxes computed after render; consumed by `postprocess.py` to target regions
- Computed by: `render_scene.py:976` `object_image_bounds()` using `world_to_camera_view` projection
- Format: `{name, materials, signature, bounds_norm: [x0,y0,x1,y1], bounds_px: [...]}`

**Enterprise Recipe Matrix:**
- Purpose: Deterministic recipe builder for the catalog workflow
- Location: `lib/enterprise-recipes.ts`
- Pattern: One recipe per `metal × angle × pass` combination (e.g. 3 metals × 4 angles × 3 passes = 36 jobs)
- Named: `enterprise_<product>_<pass>_<metal>_<stoneGroup>_<angle>`
- Passes: `full` (all objects), `metal` (only metal objects visible), `stone` (only stone objects visible) — carrying over the holdout/grouping concept from the legacy Flask renderer

## Entry Points

**Next.js App Root:**
- Location: `app/page.tsx` (renders `<EnterpriseApp/>`) and `app/lab/page.tsx` (renders `<Studio/>`)
- Triggers: HTTP requests to Vercel deployment

**Primary API:**
- Location: `app/api/render-jobs/route.ts`
- Triggers: POST from UI to submit a render; GET from UI to poll status

**RunPod Worker:**
- Location: `workers/runpod-blender/handler.py:78` (`handler(job)`)
- Triggers: RunPod serverless invocation when a job is dispatched
- Responsibilities: Download model, dispatch to render or inspect, upload results, return URLs

**Blender Renderer:**
- Location: `workers/runpod-blender/render_scene.py:1021` (`main()`)
- Triggers: `blender --background --python render_scene.py -- --model … --recipe … --output … --metadata …`

## Render Pipelines in render_scene.py

### Pipeline 1 — Standard Import (default)

Triggered when `recipe.source_scene.enabled` is falsy (or absent). Executed in `main()` starting at `render_scene.py:1050`:

1. `clear_scene()` — delete all default Blender objects (`render_scene.py:127`)
2. `setup_render(recipe)` — Cycles GPU, samples, bounces=16, color management (view_transform, look, exposure, gamma)
3. `setup_world(recipe)` — flat color or HDRI environment
4. `import_model(path)` — dispatches on extension: `.glb/.gltf` → `import_scene.gltf`, `.fbx` → `import_scene.fbx`, `.obj` → `wm.obj_import`, `.stl` → `wm.stl_import`, `.blend` → `bpy.data.libraries.load` (`render_scene.py:132`)
5. `filter_product_objects(objects, model)` — hide objects whose signature matches `exclude_contains` tokens or fails `include_contains` filter (`render_scene.py:329`)
6. `normalize(objects, model)` — shade smooth/flat per gem-exclude tokens, auto-center, auto-scale to `target_size` (`render_scene.py:347`)
7. `apply_object_transforms(objects, model)` — per-token scale/translate individual object groups (`render_scene.py:393`)
8. `add_generated_band(objects, model)` — optional procedural torus shank (`render_scene.py:419`)
9. `transform_model(objects, model, background)` — global rotation, translation, `ground_to_plane` (sit piece on backdrop)
10. `assign_materials(objects, recipe)` — per `material_strategy` + `material_map` rules; presets via `make_material()` / `make_catalog_diamond_material()`; embedded via `adjust_source_material()` (deep node-graph edits)
11. `setup_background(recipe)` → `add_contact_shadows(recipe)` → `add_reflection_cards(recipe)` → `add_lights(recipe)` → `setup_camera(recipe)` → optional `add_center_facet_overlay()`
12. `bpy.ops.render.render(write_still=True)` → PNG to `--output` path
13. Write `metadata.json` with merged recipe, multi-stage bounds, selected/generated/overlay object names, `object_image_bounds` (used by postprocess.py)

### Pipeline 2 — Source Scene (source_scene.enabled = true)

Triggered when `recipe.source_scene.enabled` is `true`. Executed in `main()` starting at `render_scene.py:1024`. Used by v173+ recipes that re-pose/re-light a known-good `.blend` studio file.

1. `bpy.ops.wm.open_mainfile(filepath=…)` — opens the full `.blend` studio scene (`render_scene.py:174`)
2. Optionally switch scene (`scene_name`) and camera (`camera_name`)
3. `setup_render(recipe)` — apply render settings from recipe
4. If `use_recipe_camera`: `setup_camera(recipe)` — rebuild camera from recipe coords
5. If `apply_recipe_materials`: `assign_materials(source_scene_mesh_objects(recipe), recipe)`
6. `apply_source_scene_adjustments(recipe)` — `group_adjustments` (pivot-based rotate/scale/translate matched mesh groups), `object_adjustments` (hide/show, reposition, material-adjust individual objects), `light_adjustments` (power/position/color/size per matched lights)
7. `apply_source_camera_adjustment(recipe)` — orbit-style camera: yaw around target mesh centroid, `distance_scale`, `height_scale/offset`, focal length adjust (`render_scene.py:213`)
8. `add_reflection_cards_from_configs(source_scene.reflection_cards)` — extra reflection cards
9. Render PNG, write `metadata.json` with `source_scene: true` flag

## Post-Processing Pipeline (postprocess.py)

`apply_postprocess(render_path, metadata, recipe)` runs Pillow passes in order, all opt-in via their config block, all using `object_image_bounds` to target regions:

1. `studio_background` — replace rendered background with synthetic gradient + soft elliptical drop shadows; product masked by chroma/brightness + object bounds
2. `product` — crop product region; apply contrast / brightness / saturation / sharpness + unsharp mask; blend back with feathered mask
3. `side_soften` — blur/soften arbitrary normalized regions
4. `center_stone` — enhance center gem crop (contrast, unsharp, LAB-channel detail boost) inside feathered ellipse
5. `center_stone_symmetry` — measure left vs right "clarity"; copy the better-looking half's grade onto the milkier half
6. `final_regions` — second region-soften pass
7. `diamond_facets` — draw synthetic brilliant-cut facet star (dark/light/fire-colored polygons + table + radial lines) as 2D overlay over the stone

Applied pass names written back into `metadata.postprocess.applied`.

## Architectural Constraints

- **Threading:** Single-threaded event loop (Next.js / Node.js); no background workers in the web process. GPU work runs on RunPod, polled lazily.
- **Global state:** `DEFAULT_RECIPE` dict at module level in `render_scene.py:15` — read-only; never mutated. No shared mutable state in lib/.
- **No DB schema migrations:** Job records are schemaless JSON blobs; field additions are additive and backward-compatible.
- **Blob as DB:** Listing all jobs = `list({prefix: "app-state/render-jobs/"}, limit: 1000)` in `lib/jobs.ts:64` — at scale this could become a bottleneck but is adequate for current volume.
- **Blender version dependency:** Worker Docker image pins a specific Blender binary. v153+ recipes assume Blender 5 features on `son2` model; v143–v152 were on Blender 4.

## Anti-Patterns

### Hardcoded Fallback Recipe Path

**What happens:** `app/api/rating-sweeps/route.ts` references `outputs/ring99/recipes/v144b_…json` as a hardcoded fallback base recipe.
**Why it's wrong:** This local filesystem path is only valid in the development checkout, not on Vercel.
**Do this instead:** Store canonical base recipes in `recipes/` and load them as static imports, or put them in Vercel Blob.

### `apps/` Empty Scaffolding

**What happens:** `apps/api/app/` and `apps/web/src/` exist as empty directories.
**Why it's wrong:** Causes confusion about where the active Next.js app lives.
**Do this instead:** The active app is the top-level `app/` directory. Ignore or delete `apps/`.

## Error Handling

**Strategy:** Fail fast with Blender stdout/stderr returned to caller.

**Patterns:**
- `handler.py` returns `{"error": "…", "stdout": last_4000_chars, "stderr": last_4000_chars}` on non-zero Blender exit code
- API routes return `NextResponse.json({error: message}, {status: 500})` on exceptions
- Job `status` field progresses: `queued` → `submitted` → RunPod statuses (`IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`)
- `job.error` string is set from `status.error || status.output` on FAILED
- `BLENDER_TIMEOUT_SECONDS` (default 1800) enforced by `subprocess.run(timeout=…)` in `handler.py:74`

## Cross-Cutting Concerns

**Logging:** Blender stdout/stderr captured via `subprocess.run(capture_output=True)` in `handler.py:69`. Last 4000 chars surfaced to API on failure. No structured logging framework.
**Validation:** No schema validation on recipes — the worker simply reads keys with `.get()` defaults. Invalid recipes produce Blender errors captured in stderr.
**Authentication:** None. The Vercel app and Blob URLs are public. RunPod API key and Blob token are env vars only, never exposed to the browser except that the blob/upload API grants a scoped client-upload token.

## External Legacy System (external-work/cloud-renderer-glmr/)

A **separate, nested git repository** (has its own `.git/`) — not wired into the Next.js/RunPod system. Flask + local Blender + SQLite architecture. Its architectural concepts that carried forward:

- **Holdout / group passes:** The legacy Flask renderer produced layered output — metal as JPEG + each stone group as a transparent PNG for compositing. This idea lives on as the `full` / `metal` / `stone` passes in `lib/enterprise-recipes.ts`.
- **Master scene + script generator:** `blender_scripts.py` generated Blender Python as a string. The main project replaced this with the declarative recipe JSON + `render_scene.py` interpreter.
- **Material library:** 193-material `MyMaterials.blend` append-based system. Main project replaces this with inline recipe material presets and `adjust_source_material()` node-graph edits.

---

*Architecture analysis: 2026-06-05*
