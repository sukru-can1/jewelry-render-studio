# Testing Patterns

**Analysis Date:** 2026-06-05

## Test Framework

**Runner:** None

There is no automated test framework configured in this project. `package.json` defines only four scripts:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```

`next lint` is the only quality gate — it runs the Next.js built-in ESLint config. There are no Jest, Vitest, Mocha, or pytest configurations. No `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.test.py`, or `test_*.py` files exist anywhere in the project (excluding `node_modules`).

**Python side:** No `pytest.ini`, `setup.cfg`, `pyproject.toml`, or `conftest.py`. The `requirements.txt` files (`requirements.txt`, `workers/runpod-blender/requirements.txt`) include no testing libraries.

---

## De-facto QA Approach

All verification is manual and visual. The workflow is:

### 1. Render a Recipe Against a Real Model

Scripts in `scripts/` generate recipe JSON files, which are then submitted to Blender (locally or via RunPod). Local rendering:

```bash
# Via render_batch.py — iterates experiment variants from a recipe
python scripts/render_batch.py \
  --recipe outputs/ring99/recipes/<recipe>.json \
  --model blend/ring99.blend \
  --output outputs/ring99/<variant_dir>/

# Via submit_runpod_render.py — sends a single recipe to RunPod GPU
python scripts/submit_runpod_render.py --recipe <recipe>.json
```

### 2. Inspect the Output PNG Visually

The primary output of a render is a PNG image (plus a sidecar `metadata.json`). A human examines the render for:
- Diamond fire / facet quality
- Metal reflections and tone
- Contact shadow quality
- Background gradient correctness
- Postprocess center-stone enhancement

### 3. Contact Sheet for Batch Comparison

`scripts/make_contact_sheet.py` tiles all `variant_*/render.png` outputs from a `render_batch.py` run into a single image for side-by-side comparison:

```bash
python scripts/make_contact_sheet.py \
  --input outputs/ring99/<variant_dir>/ \
  --output outputs/ring99/<variant_dir>/contact_sheet.jpg \
  --columns 4 \
  --thumb-size 320
```

`scripts/run_recipe_sweep.py` submits multiple recipes to RunPod and downloads results, then assembles an inline contact sheet using Pillow.

### 4. Rater UI Tournament

`app/rater/page.tsx` provides a browser-based tournament interface. It fetches completed RunPod jobs from `/api/render-jobs`, displays their output images side-by-side, and allows a user to assign per-image scores for: overall, brightness, diamond, shadow, reflection, product. A weighted score function selects the best candidate:

```typescript
// from app/api/rating-sweeps/route.ts
function score(rating?: Rating) {
  return (
    (rating.overall || 0) * 3 +
    (rating.diamond || 0) * 2 +
    (rating.brightness || 0) +
    (rating.shadow || 0) +
    (rating.reflection || 0) +
    (rating.product || 0) * 1.5 +
    (rating.verdict || 0) * 2
  );
}
```

The rater POST endpoint (`/api/rating-sweeps`) reads the winner and generates 5 new recipe variants (jittered around the winner) for the next iteration — this is the human-in-the-loop optimization loop.

### 5. Metadata JSON Inspection

Every render produces a `<job_id>.json` metadata file uploaded to Vercel Blob alongside the PNG. It contains `object_image_bounds` (bounding boxes of each visible mesh in image-space pixels), camera transform, render settings, and material assignments. Developers inspect this JSON to debug object detection issues or postprocess region problems.

---

## Test Coverage Gaps

**All TypeScript API routes — no coverage:**
- `app/api/render-jobs/route.ts` — job creation, RunPod submission, status polling
- `app/api/render-jobs/[id]/route.ts` — individual job fetch and status update
- `app/api/rating-sweeps/route.ts` — recipe generation from ratings, complex scoring and jitter logic
- `app/api/material-inspections/route.ts` — material inspection submission
- `app/api/blob/upload/route.ts` — Vercel Blob upload token generation

**All library modules — no coverage:**
- `lib/jobs.ts` — job creation, blob persistence, listing
- `lib/runpod.ts` — RunPod API client
- `lib/enterprise-recipes.ts` — recipe builder (complex logic: visibility rules, material map construction, token fallbacks)

**Python worker — no coverage:**
- `workers/runpod-blender/render_scene.py` — `deep_merge`, `object_signature`, `assign_materials`, all setup functions
- `workers/runpod-blender/postprocess.py` — full postprocess pipeline (studio_background, center_stone, symmetry, diamond_facets)
- `workers/runpod-blender/handler.py` — end-to-end handler dispatch

**Recipe-generating scripts — no coverage:**
- All 60+ `scripts/create_vNNN_*.py` scripts produce JSON output but the output is never structurally validated
- No schema enforcement that recipe keys consumed by `render_scene.py` match keys emitted by scripts

**Risk areas with no test safety net:**
- `buildEnterpriseRecipe` in `lib/enterprise-recipes.ts`: complex token fallback and visibility logic; a regression here would silently wrong-assign materials to objects in production renders
- `deep_merge` in `render_scene.py`: a bug here would corrupt every render recipe
- `postprocess.py` pipeline: multiple image-manipulation steps with floating-point clamp arithmetic; silent incorrect output rather than hard failures
- `object_signature` token matching: relies on exact Blender object name substrings; name changes in source `.blend` files break silently

---

## Recommended First Test Targets

If an automated test suite is introduced, prioritize:

1. `lib/enterprise-recipes.ts` — `buildEnterpriseRecipe()` is pure and has no I/O dependencies; it is the highest-value unit to test
2. `deep_merge()` in `render_scene.py` — pure function, easy to cover edge cases (nested overrides, array replacement, missing keys)
3. `object_signature()` in `render_scene.py` — pure function, critical to material assignment correctness
4. `score()` in `app/api/rating-sweeps/route.ts` — pure function, drives the optimization loop

For Python, pytest with no external dependencies would cover items 2–4. For TypeScript, Vitest would cover item 1 with no additional config beyond `vitest.config.ts`.

---

*Testing analysis: 2026-06-05*
