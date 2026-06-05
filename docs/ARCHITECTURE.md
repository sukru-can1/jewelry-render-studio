# Jewelry Render Studio — Architecture & Project Documentation

> Comprehensive reference for `codex_render` (a.k.a. **Jewelry Render Studio**).
> This document was reverse-engineered from the codebase, the existing `docs/`
> notes, the git history, and the worker/script sources. It is the single best
> starting point for anyone (human or AI) joining this project.

---

## 1. What This Project Is

**Jewelry Render Studio** is a cloud-first, **recipe-driven** Blender/Cycles
rendering system that turns a 3D jewelry model (a ring, etc.) into
photorealistic catalog/storefront images.

The central idea: **the entire studio look lives in a JSON "recipe"** — lights,
world strength, camera, background, material presets, gemstone shaders, shadow
softness, color management, output settings, and post-processing. Because the
look is data, it can be iterated, versioned, swept across parameter ranges, and
generated programmatically (by a UI, by Python scripts, or by an AI agent).
The geometry stays fixed; only the recipe changes to produce many catalog
variants (white gold + diamond, rose gold + ruby, yellow gold + emerald, …).

The web/API layer **does not render locally**. It uploads assets to storage,
submits jobs to a GPU cloud, polls status, and displays results.

### Origin note
This repository was built with **OpenAI Codex** running in a sandbox — the git
repo is owned by a `CodexSandboxOffline` user. All 19 commits are authored by
"Sukru Can". There are no Codex `AGENTS.md` memory files in the tree; the
persistent project knowledge lives in the `docs/` folder, the `README.md`, and
the versioned recipes/scripts (the `vNNN` progression described in §7). The one
`CLAUDE.md` in the repo belongs to a *separate, older* project copied into
`external-work/` (see §9).

---

## 2. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js dashboard on Vercel  (app/)                                   │
│    • Studio / Lab page  – paste-a-recipe sandbox                       │
│    • Enterprise page    – catalog matrix (metals × angles × passes)    │
│    • Rater page         – live render monitor + tournament feedback    │
└───────────────┬──────────────────────────────────────────────────────┘
                │  Vercel API routes (app/api/**, Node.js runtime, 60s)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Vercel Blob                                                           │
│    • models/        uploaded GLB/FBX/BLEND/OBJ/STL                     │
│    • outputs/       rendered PNGs + metadata.json                      │
│    • app-state/render-jobs/<id>.json   ← the "database" (job records)  │
│    • material-inspections/  inventory JSON                            │
└───────────────┬──────────────────────────────────────────────────────┘
                │  RunPod /v2/{endpoint}/run  (Bearer RUNPOD_API_KEY)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  RunPod Serverless GPU worker  (workers/runpod-blender/)               │
│    handler.py → blender --background --python render_scene.py          │
│              → postprocess.py (Pillow)                                 │
│              → upload PNG + metadata back to Vercel Blob               │
└──────────────────────────────────────────────────────────────────────┘
```

There is **no traditional database**. Job state is a set of JSON blobs under
`app-state/render-jobs/` in Vercel Blob. Listing/polling jobs = listing those
blobs and (for in-flight jobs) refreshing their status from the RunPod API.

### Tech stack
| Layer | Technology |
|-------|------------|
| Frontend / API | Next.js 15 (App Router), React 19, TypeScript, Lucide icons |
| State / storage | Vercel Blob (`@vercel/blob`), public access by default |
| GPU compute | RunPod Serverless, Docker (CUDA 12.4 + Blender) |
| Renderer | Blender **Cycles** (GPU) |
| Post-processing | Python + Pillow (PIL) |
| Local tooling | Python scripts (recipe sweeps, batch render, contact sheets) |

---

## 3. Repository Layout

```text
codex_render/
├── app/                      Next.js App Router (UI + API)
│   ├── page.tsx              → renders <EnterpriseApp/>
│   ├── enterprise-app.tsx    Catalog matrix UI (production workflow)
│   ├── studio.tsx            Paste-a-recipe sandbox UI
│   ├── lab/page.tsx          Sandbox route (uses the Studio component)
│   ├── rater/page.tsx        Live render monitor + rating tournament
│   ├── default-recipe.json   Seed recipe shown in the Studio editor
│   ├── styles.css, layout.tsx
│   └── api/
│       ├── render-jobs/route.ts        POST submit / GET list+refresh
│       ├── render-jobs/[id]/route.ts   GET single job (refresh status)
│       ├── material-inspections/route.ts  POST inspect a model
│       ├── rating-sweeps/route.ts      POST generate next-gen recipes
│       ├── blob/upload/route.ts        Client-upload token grant
│       └── config/route.ts             GET which env vars are configured
├── lib/
│   ├── types.ts              RenderJob / BlobAsset types
│   ├── jobs.ts               Job CRUD over Vercel Blob (the "DB" layer)
│   ├── runpod.ts             submit / status helpers for RunPod API
│   └── enterprise-recipes.ts Deterministic recipe builder for the matrix UI
├── workers/runpod-blender/   The GPU worker (shipped as a Docker image)
│   ├── handler.py            RunPod serverless entry point
│   ├── render_scene.py       THE renderer (recipe → Blender scene → PNG)
│   ├── postprocess.py        Pillow post-processing passes
│   ├── inspect_materials.py  Material/inventory extraction operation
│   ├── pod_render_once.py    One-shot pod (non-serverless) render path
│   ├── Dockerfile            CUDA + Blender image
│   └── requirements.txt      runpod, requests, vercel, Pillow
├── recipes/                  Curated catalog recipes (committed)
│   ├── glamira_white_catalog.json
│   └── ring99_hybrid_catalog.json
├── scripts/                  Local iteration toolbox (~90 files, see §7)
│   ├── blender_render.py     Local headless renderer (older sibling of worker)
│   ├── render_batch.py       Batch local renders + contact sheet
│   ├── run_recipe_sweep.py   Submit a recipe folder to RunPod, poll, collect
│   ├── create_vNNN_*.py      Recipe-sweep generators (the iteration history)
│   ├── postprocess_*.py      Standalone post-render experiments
│   ├── import_*.mjs          Backfill finished renders into the Blob job DB
│   ├── create_runpod_endpoint.py / *.ps1 / update_*  RunPod/Docker ops
│   └── make_contact_sheet.py, submit_runpod_render.py, upload_blob_file.py
├── blend/                    Local source .blend files (gitignored, large)
│   ├── ring99.blend (51 MB), son2.blend (51 MB), 1scene.blend (171 MB)
├── outputs/                  Local render history + promoted recipes (mostly
│                             gitignored; outputs/ring99/recipes is referenced
│                             by the rating-sweeps API as a fallback base)
├── docs/                     Documentation (this file lives here)
│   ├── ARCHITECTURE.md (this), VERCEL_DEPLOYMENT.md, MATERIALS.md,
│   └── RING99_NEXT_STEPS.md
├── external-work/cloud-renderer-glmr/   A separate older Flask renderer (§9)
├── apps/                     Empty scaffolding (apps/api, apps/web) — unused
├── README.md, vercel.json, next.config.ts, package.json, tsconfig.json
├── requirements.txt          Root: Pillow only (for local postprocess scripts)
└── .env / .env.local / .env.example
```

> **Note:** `apps/` contains only empty `api/app` and `web/src` folders — it is
> leftover scaffolding and not part of the live system. The active Next.js app
> is the top-level `app/` directory.

---

## 4. The Recipe Format (the heart of the system)

A recipe is a JSON object describing a complete studio scene. The worker merges
it over a `DEFAULT_RECIPE` (`workers/runpod-blender/render_scene.py:15`), so a
recipe only needs to specify what differs from the defaults. Key sections:

| Section | Purpose |
|---------|---------|
| `render` | resolution, `samples`, `denoise`, `transparent` film, color management (`view_transform`, `look`, `exposure`, `gamma`) |
| `camera` | `position`, `target` (look-at), `focal_length`, `shift_x/y`, `depth_of_field` (`enabled`, `f_stop`, `focus_distance`) |
| `world` | flat color + `strength`, or an `hdri_url` + `hdri_strength` environment |
| `background` | catalog backdrop plane: `color`, `plane_size`, `plane_z` |
| `model` | pose & cleanup: `auto_center`, `auto_scale`, `target_size`, `rotation_degrees`, `translation`, `ground_to_plane`, `ground_clearance`, `shade_smooth` (+ exclude tokens for faceted gems), `include_contains` / `exclude_contains` (filter helper geometry), `object_transforms`, optional procedural `generated_band` |
| `material_strategy` | `override` (default — replace matched materials), `source` (keep all embedded materials), or `hybrid` (override only matched objects, keep the rest) |
| `material_map` | ordered rules mapping object-name/material **`contains`** tokens → either a recipe `material` preset or a `source_material` (a material already inside the model) with optional `source_material_adjust` node-level tweaks |
| `materials` | named presets; types `metal`, `gem`, `catalog_diamond` (a custom Glass+Glossy+Transparent node network) |
| `lights` | array of `AREA`/`POINT` lights (`position`, `rotation_degrees`, `size`/`size_y`, `power`, `shadow_soft_size`, `color`) |
| `reflection_cards` | planes that shape metal/gem reflections; per-ray visibility (`visible_to_camera`, `visible_to_glossy`, etc.) so they reflect without appearing |
| `contact_shadows` | layered soft circles fading under the piece |
| `facet_overlay` | optional in-Blender 3D faceted star drawn over the center stone |
| `source_scene` | alternate mode: open a full `.blend` studio scene and only re-pose/re-light/re-grade it (see §6.2) |
| `postprocess` | Pillow passes applied after render (see §8) |

`object_signature(obj)` = lowercased `"<object name> <material names>"`. Almost
all matching (`material_map`, transforms, filters, post-process targeting) works
by substring `contains` tokens against this signature, which is why **predictable
object names matter** (see `docs/MATERIALS.md`).

Reference recipes to read: `recipes/ring99_hybrid_catalog.json` (a real,
heavily-tuned hybrid recipe) and `app/default-recipe.json` (the editor seed).

---

## 5. The Web App (frontend + API)

### 5.1 Three UI surfaces

All three are client-side React rendered by the same Next.js app.

1. **Enterprise app** (`app/enterprise-app.tsx`, the default `/` route) —
   the **production catalog workflow**:
   - Upload a product model → it auto-submits a **material inspection** job.
   - The returned inventory lets the user classify detected meshes into groups:
     `alloycolour` (metal), `diamond` (center), `stone2`/`stone3` (accents).
   - Choose **metals** (white/yellow/rose gold), **camera angles**
     (hero/front/top/profile), and **passes** (`full` / `metal` / `stone`).
   - `lib/enterprise-recipes.ts` deterministically builds one recipe per
     `metal × angle × pass` combination (e.g. 3 × 4 × 3 ≈ 36 jobs) and submits
     them as a batch to `/api/render-jobs`. A live grid tracks completion.
   - Recipe names: `enterprise_<product>_<pass>_<metal>_<stoneGroup>_<angle>`.

2. **Studio / Lab** (`app/studio.tsx`, routes `/` historically and `/lab`) —
   the **paste-a-recipe sandbox**: upload any model, edit the full recipe JSON
   directly, submit a single render or a 3-variant sweep, run material
   inspection, and watch results poll in. Maximum control, no structure.

3. **Rater** (`app/rater/page.tsx`) — a **live render monitor and rating
   tournament**: shows the newest render large with a recent grid, lets a human
   score candidates (overall / diamond / brightness / shadow / reflection /
   product, plus a verdict and free-text note), and feeds those scores to
   `/api/rating-sweeps` to generate the **next generation** of recipes (a
   human-in-the-loop optimization loop — see §5.3).

### 5.2 API routes (`app/api/**`, all `runtime = "nodejs"`, `maxDuration = 60`)

| Route | Method | Behavior |
|-------|--------|----------|
| `/api/config` | GET | Reports which env vars are present (Blob / RunPod key / endpoint) so the UI can warn about missing setup |
| `/api/blob/upload` | POST | Grants a Vercel Blob **client-upload** token (the browser uploads large `.blend` files straight to Blob — the function never receives the file body) |
| `/api/render-jobs` | POST | `createJob` → `submitRunPod({operation:"render", …})` → `saveJob` to Blob |
| `/api/render-jobs` | GET | Lists all job blobs; for any non-terminal job with a `runpodJobId`, refreshes status from RunPod and re-saves |
| `/api/render-jobs/[id]` | GET | Fetches one job; refreshes its RunPod status if in-flight |
| `/api/material-inspections` | POST | Submits a model with `operation:"inspect_materials"` |
| `/api/rating-sweeps` | POST | Builds 5 new recipe variants from human ratings and submits them all |

### 5.3 Job model & lifecycle (`lib/jobs.ts`, `lib/runpod.ts`, `lib/types.ts`)

A `RenderJob` (`lib/types.ts`) carries `id`, `status`, `runpodJobId`, `model`
(a `BlobAsset`), optional `referenceImage`, the `recipe`, an `outputPrefix`,
timestamps, and `result`/`error`. Lifecycle:

```text
createJob()  status=queued, id=uuid, outputPrefix=outputs/<model>/<id>
   │  saveJob → app-state/render-jobs/<id>.json  (Blob, public, overwritable)
submitRunPod({operation, job_id, model, recipe, output:{provider:"vercel_blob",
              prefix, access}})  →  POST https://api.runpod.ai/v2/<endpoint>/run
   │  job.runpodJobId = response.id; status=submitted
[poll]  GET /api/render-jobs → getRunPodStatus(runpodJobId)
   │  status ∈ IN_QUEUE → IN_PROGRESS → COMPLETED | FAILED | CANCELLED
   │  job.result = full RunPod status (incl. worker output: image_url, etc.)
```

The RunPod worker writes the actual PNG + metadata to Blob under the job's
`outputPrefix`, and returns the Blob URLs in its output payload, which the API
surfaces back through the job's `result`.

The **rating-sweeps** route (`app/api/rating-sweeps/route.ts`) is the most
elaborate: it scores rated candidates, picks a winner (explicit or
highest-scoring), uses that winner's recipe (or a bundled fallback,
`outputs/ring99/recipes/v144b_…json`) as the base, and emits **5 jittered
exploration variants** (`explore_dark_studio`, `explore_soft_photo`,
`explore_diamond_fire`, `explore_clean_bright`, `explore_contact_shadow`),
adjusting exposure, world strength, individual named light powers, reflection
card colors, the diamond shader, and center-stone post-processing based on the
human's focus tags and notes. It then submits all five to RunPod.

---

## 6. The GPU Worker (`workers/runpod-blender/`)

### 6.1 `handler.py` — RunPod serverless entry point
Reads `job["input"]` (`operation`, `job_id`, `model`, `recipe`, `output`).
In a temp dir it downloads the model, writes `recipe.json`, then:

- **`operation == "inspect_materials"`**: runs `blender --background --python
  inspect_materials.py -- --model … --output material_inventory.json`, uploads
  the inventory JSON to Blob, returns its URL.
- **`operation == "render"`** (default): runs `blender --background --python
  render_scene.py -- --model … --recipe … --output render.png --metadata
  metadata.json`, then `apply_postprocess(render.png, metadata, recipe)`
  (Pillow), uploads the PNG and metadata JSON to Blob, and returns
  `image_url` / `metadata_url`.

Blender stdout/stderr (last 4000 chars) is returned on failure for debugging.
Timeout is `BLENDER_TIMEOUT_SECONDS` (default 1800s).

### 6.2 `render_scene.py` — the renderer (≈1100 lines)
This is the core. It merges the recipe over `DEFAULT_RECIPE` and runs one of two
pipelines:

**Standard import pipeline** (`main()`):
1. `clear_scene()` → `setup_render()` (Cycles GPU, samples, bounces=16,
   color management) → `setup_world()` (flat color or HDRI).
2. `import_model()` — dispatches on extension (`.glb/.gltf`, `.fbx`, `.obj`,
   `.stl`, `.blend`); returns the new mesh objects.
3. `filter_product_objects()` — drop helper geometry via include/exclude tokens.
4. `normalize()` — shade smooth (gems excluded → flat-shaded facets), compute
   bounds, auto-center, auto-scale to `target_size`.
5. `apply_object_transforms()` → optional `add_generated_band()` (procedurally
   builds a torus shank) → `transform_model()` (rotation, translation,
   `ground_to_plane` so the piece sits on the backdrop).
6. `assign_materials()` — per `material_strategy` + `material_map`; presets via
   `make_material()` / `make_catalog_diamond_material()`; embedded materials via
   `adjust_source_material()` (deep node-graph edits: glass color/roughness/IOR,
   Principled BSDF, volume absorption density, HSV nodes, emission, etc.).
7. `setup_background()` → `add_contact_shadows()` → `add_reflection_cards()`
   → `add_lights()` → `setup_camera()` → optional `add_center_facet_overlay()`.
8. Render to PNG. Write `metadata.json` containing the merged recipe, bounds at
   each transform stage, selected/generated/overlay object names, the per-object
   **image-space bounding boxes** (`object_image_bounds`, projected with
   `world_to_camera_view`), and the material list. Those image bounds are what
   the post-processing stage uses to target the center stone / product region.

**Source-scene pipeline** (`source_scene.enabled = true`): instead of importing
a bare model, it opens a complete `.blend` studio scene, optionally switches
scene/camera, optionally applies recipe materials/camera, then applies
**group/object/light adjustments** and an orbit-style **camera adjustment**
(`yaw`, `distance_scale`, `height_scale/offset`, focal length) around a target
mesh, plus extra reflection cards. This is how the heavily-tuned `son2`/source
recipes (v173+) re-pose and re-light a known-good scene rather than rebuilding
it from scratch.

### 6.3 `inspect_materials.py`
Imports the model and emits a `material_inventory.json`: object names, mesh
material slots, material names, Principled BSDF values, and node names/types.
The dashboard uses it to build the `material_map` from real names instead of
guessing (see `docs/MATERIALS.md`).

### 6.4 `pod_render_once.py`
A one-shot, **non-serverless** render path: reads job parameters from env vars
(`MODEL_URL`, `RECIPE_JSON_B64`, `BLOB_READ_WRITE_TOKEN`, …), runs the same
Blender + postprocess + Blob-upload flow once and exits. Useful for renting a
plain GPU pod instead of the serverless endpoint.

### 6.5 Docker / CI
`Dockerfile` builds a CUDA 12.4 Ubuntu image with a pinned Blender binary and
the `requirements.txt` deps, copying the worker dir and running `handler.py`.
`.github/workflows/runpod-worker-image.yml` builds and pushes that image to
GHCR on changes under `workers/runpod-blender/**` (and on manual dispatch),
tagging `:latest` plus a version/sha tag. RunPod points an endpoint at the
published image.

---

## 7. The Local Iteration Toolbox (`scripts/`) & the `vNNN` Story

About 90 files. They are **not part of the deployed app** — they are the offline
R&D rig used to discover good recipes, which then get promoted into
`recipes/`, bundled with the app, or imported into the Blob job DB.

**Core tools:**
- `blender_render.py` — a local, standalone headless renderer (an earlier
  sibling of `render_scene.py`) for rendering a recipe on a local Blender.
- `render_batch.py` — render a set of recipes locally and assemble a **contact
  sheet** (supports factorial `experiments` expansion via `itertools.product`).
- `run_recipe_sweep.py` — submit a folder of recipes to the RunPod endpoint,
  poll with backoff, download the finished renders, build a contact sheet.
- `make_contact_sheet.py`, `submit_runpod_render.py`, `upload_blob_file.py` —
  smaller helpers.
- RunPod/Docker ops: `create_runpod_endpoint.py`, `create_runpod_render_pod.py`,
  `publish_runpod_worker.ps1`, `update_runpod_endpoint_blender5*.py/.mjs`.

**`create_vNNN_*.py` — recipe-sweep generators.** Each script loads a known-good
base recipe, mutates a few parameters, and writes out a handful of labeled
variant JSONs (e.g. `vNNNa/b/c`). Read end-to-end, the filenames are a visual
R&D diary of how the look was dialed in:

| Range | Theme |
|-------|-------|
| v143–v152 | original product sweeps; render-material, diamond, center-mask, metal-environment, side-metal tuning |
| v153–v172 | the **`son2`** model on **Blender 5**: stone/metal balance, flash control, reflection-only floor fixes, lower-camera separation/contact-shadow, silver-shank recovery |
| v173–v180 | **source-scene** recipes: darker white gold, deeper grade, diamond refine/environment, clean center diamond, material swap |
| v181–v186 | systematic **camera-angle** sweeps (reference angle sets, scaled/midscale) |
| v187–v191 | studio-HDRI research, diamond/scene/camera refine and polish |
| v192–v197 | dedicated **front** poses, depth refine, milky-side balance, adaptive symmetry |
| v200–v203 | **physical "smart cards"** and final angle-set consolidation |

**`postprocess_*.py`** — standalone Pillow experiments run *after* a render
(diamond facet/brilliant/donor-texture/natural/goalcut variants, photo grade,
goal-aim, stone-half balance). The winning ideas were folded into the worker's
`postprocess.py`.

**`import_*.mjs`** — Node scripts that take finished local renders (v190–v203
batches, etc.), wrap them as `RenderJob` records, and upload them to
`app-state/render-jobs/<id>.json` so they show up in the dashboard/Rater
alongside cloud jobs.

---

## 8. Post-Processing (`workers/runpod-blender/postprocess.py`)

A Pillow pipeline applied to the rendered PNG, driven by `recipe.postprocess`.
`apply_postprocess()` runs these passes in order (each is opt-in via its config
block and uses the metadata's `object_image_bounds` to target regions):

1. `studio_background` — replace the rendered background with a synthetic
   gradient backdrop + soft elliptical drop shadows, protecting the product via
   a chroma/brightness mask (and its object bounds).
2. `product` — crop the product region, apply contrast/brightness/saturation/
   sharpness + unsharp mask, blend back with a feathered mask.
3. `side_soften` — blur/soften arbitrary normalized regions.
4. `center_stone` — enhance the center gem crop (contrast, unsharp, LAB-channel
   detail boost) inside a feathered ellipse.
5. `center_stone_symmetry` — adaptively measure left vs right "clarity" of the
   center stone and copy the better-looking half's grade onto the milkier half.
6. `final_regions` — another region-soften pass.
7. `diamond_facets` — draw a synthetic brilliant-cut facet star (dark/light/
   fire-colored polygons + table + radial lines) over the stone as a 2D overlay.

The applied pass names are recorded back into the metadata (`postprocess.applied`).

---

## 9. `external-work/cloud-renderer-glmr/` (separate, older project)

This subfolder is a **different, self-contained git repository** (it has its own
`.git/`, so it is a copied/nested repo, **not** a submodule) with its own
`CLAUDE.md`. It is the **predecessor** approach and is **not** wired into the
Next.js/RunPod system — keep it for reference only.

It is a **Flask + local Blender** jewelry renderer:
- Flask app (`app.py`) with a REST API and a SQLite DB (`models.py`:
  `Project/Product/Material/CameraPreset/RenderBatch/RenderJob/StoneConfig`).
- A `LocalWorker` daemon thread (`worker.py`) polls pending jobs every 2s and
  shells out to `blender --background <master_scene> --python <tempfile>`.
- `blender_scripts.py` **generates** the Blender script as a string (notably it
  uses `--python <tempfile>`, never `--python-expr`, to dodge the Windows ~32K
  command-line limit for big object-group maps).
- A **master studio scene** with a reference product that defines the ideal
  pose/framing, and a **holdout** rendering technique to produce layered output
  (metal as JPEG + each stone group as a transparent PNG for compositing).
- Materials are appended from a 193-material `MyMaterials.blend` library.

Contrast with the main project: Flask+SQLite+local-GPU and FBX-centric, vs.
Next.js+Blob+RunPod and multi-format + inline-recipe materials. The main
project's recipe-driven design replaced the master-scene + script-generator
design, but the holdout/grouping ideas carried over (the `metal`/`stone`/`full`
passes in `enterprise-recipes.ts`).

---

## 10. Configuration & Environment

`.env.example`:
```text
RUNPOD_API_KEY=          # Bearer token for the RunPod API
RUNPOD_ENDPOINT_ID=      # RunPod serverless endpoint id
BLOB_READ_WRITE_TOKEN=   # Vercel Blob token
BLOB_ACCESS=public       # public (default) so RunPod can fetch model URLs
```
Worker-side extras: `BLOB_ACCESS`, `BLENDER_TIMEOUT_SECONDS` (default 1800).
Optional app-side: `BLOB_PUBLIC_BASE_URL` (lets `getJob` fetch a job blob by a
known public base URL instead of `list()`).

`vercel.json` pins the framework to Next.js and caps `app/api/**` functions at
60s. `next.config.ts` is minimal. Root `requirements.txt` is just `Pillow`
(for the local `scripts/postprocess_*.py`). Gitignore excludes `models/`,
`outputs/`, `blend/`, `.env`, `node_modules/`, `.next/`, etc.

The live Vercel project (per `docs/VERCEL_DEPLOYMENT.md`) is
`sukrus-projects-1b84f634/jewelry-render-studio` →
`https://jewelry-render-studio.vercel.app`. Several Blob stores were created
during setup; one public store must be linked to the project. Because
`ring99.blend` is ~51 MB, uploads use **Blob client uploads** (browser → Blob
directly; the API only grants a token).

> **Security note (from `docs/RING99_NEXT_STEPS.md`):** a RunPod API key was
> pasted into chat during setup and **should be rotated before production**.
> Keep all keys in env vars / Vercel project settings, never committed.

---

## 11. Common Workflows (quick reference)

**Run the dashboard locally**
```bash
npm install
npm run dev        # http://localhost:3000   (needs .env / .env.local)
npm run build      # production build
```

**Build & publish the GPU worker**
```powershell
.\scripts\publish_runpod_worker.ps1 -Image docker.io/<user>/jewelry-render-worker -Version v0.1.0 -Push
python scripts\create_runpod_endpoint.py --image docker.io/<user>/jewelry-render-worker:v0.1.0
# prints RUNPOD_ENDPOINT_ID — set it in Vercel + redeploy
```
(Or let CI build/push to GHCR on changes under `workers/runpod-blender/**`.)

**Iterate on the look locally**
```bash
# generate variants, render them, eyeball a contact sheet
python scripts/create_v203_close_pose_angle_set.py
python scripts/render_batch.py <recipes...> --contact-sheet out.png
# or sweep on the cloud:
python scripts/run_recipe_sweep.py <recipe-folder> --endpoint-id <id>
```

**Produce a catalog (UI)**: open the app → Enterprise → upload model → wait for
material inspection → assign object groups → pick metals/angles/passes → render
batch → review in the grid / Rater → optionally rate winners to spawn the next
generation of recipes.

---

## 12. Gotchas & Conventions

- **Names are the API.** Object/material name substrings drive material mapping,
  transforms, filtering, and post-process targeting (`object_signature`). Use
  predictable names (`band_metal`, `center_diamond`, `Round_5`, …); avoid
  `Object001` / `Material.003`. See `docs/MATERIALS.md`.
- **Gems are flat-shaded on purpose.** `shade_smooth_exclude_contains` keeps
  diamond/stone/round_* facets sharp; smoothing them kills the sparkle.
- **`material_strategy`** decides whether embedded model materials are kept
  (`source`), fully replaced (`override`, default), or partially replaced
  (`hybrid`). Real catalog recipes here use `hybrid` to keep good source gem
  shaders while controlling the metal.
- **No DB.** "The database" is JSON blobs under `app-state/render-jobs/`. A
  listing is a Blob `list()`; status is refreshed lazily on GET.
- **The worker returns the last 4 KB of Blender stdout/stderr on failure** —
  check `job.result` / `job.error` when a render fails.
- **`apps/` is empty scaffolding; `external-work/` is a separate legacy repo.**
  Neither participates in the running system.
- **Large binaries** (`blend/`, `outputs/`, `models/`) are gitignored; don't
  expect them in a fresh clone.
```
