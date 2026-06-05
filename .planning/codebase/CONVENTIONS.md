# Coding Conventions

**Analysis Date:** 2026-06-05

---

## TypeScript / Next.js Layer

### Naming Patterns

**Files:**
- Route handlers: `app/api/<resource>/route.ts` — flat kebab-case segments, dynamic segments use `[id]` brackets
- React page components: `app/<page>/page.tsx` (Next.js App Router convention)
- Large client-side app components live as `app/<name>-app.tsx` or `app/<name>.tsx` (e.g., `app/studio.tsx`, `app/enterprise-app.tsx`)
- Lib modules: `lib/<noun>.ts` in camelCase (e.g., `lib/jobs.ts`, `lib/runpod.ts`, `lib/types.ts`, `lib/enterprise-recipes.ts`)

**Functions:**
- camelCase for all functions: `createJob`, `saveJob`, `submitRunPod`, `getRunPodStatus`, `buildEnterpriseRecipe`
- Private helper functions within a file are unexported and lower-camelCase: `slug()`, `tokensFor()`, `uniqueTokens()`, `buildVisibility()`
- React components: PascalCase (`RenderRater`, `RootLayout`)

**Variables:**
- camelCase for local variables and function parameters
- SCREAMING_SNAKE_CASE for module-level constants: `JOB_PREFIX`, `METAL_PRESETS`, `STONE_PRESETS`, `ANGLES`, `FALLBACK_TOKENS`

**Types:**
- PascalCase type aliases and exported types: `BlobAsset`, `RenderJob`, `EnterpriseRecipeRequest`, `EnterpriseAngleKey`
- Discriminated union literals for domain values: `"hero" | "front" | "top" | "profile"`, `"full" | "metal" | "stone"`
- `Record<string, unknown>` is the canonical type for open-ended recipe/config objects (used in `lib/types.ts`, every route handler body, and all recipe builder return types)

### Route Handler Conventions

Every API route file at `app/api/**/route.ts` carries these two exports at the top:

```typescript
export const runtime = "nodejs";
export const maxDuration = 60;  // seconds — omitted only on trivially-fast routes like /api/config
```

Handlers follow an explicit try/catch envelope pattern:

```typescript
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ... };
    // ... business logic ...
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Fallback message" },
      { status: 500 }
    );
  }
}
```

- Success: `NextResponse.json(payload)` — no explicit status (defaults to 200)
- Not found: `NextResponse.json({ error: "..." }, { status: 404 })`
- Client error: `NextResponse.json({ error: "..." }, { status: 400 })`
- Server error: `NextResponse.json({ error: "..." }, { status: 500 })`
- The error shape is always `{ error: string }` — never nested or differently keyed

Dynamic route handlers receive `context: { params: Promise<{ id: string }> }` and must `await context.params` before use (Next.js 15 async params requirement, shown in `app/api/render-jobs/[id]/route.ts`).

### Path Aliases

The `@/*` alias maps to the repo root (configured in `tsconfig.json` `paths`). Use it for all cross-directory imports:

```typescript
import { createJob, listJobs } from "@/lib/jobs";
import type { BlobAsset } from "@/lib/types";
import { buildEnterpriseRecipe } from "@/lib/enterprise-recipes";
```

Never use relative `../` imports that cross the `app/` ↔ `lib/` boundary.

### TypeScript Strictness

`tsconfig.json` sets `"strict": true` with `"allowJs": false`. The compiler target is `ES2017`. There is no `.eslintrc` config file; linting is performed by `next lint` (the built-in Next.js ESLint config). No Prettier config is present — formatting is not enforced by tooling.

### Recipe Typing

Recipes are typed as `Record<string, unknown>` throughout the TS layer (`lib/types.ts` `RenderJob.recipe`, route handler bodies, `buildEnterpriseRecipe` return type). Strongly-typed domain objects (`EnterpriseRecipeRequest`, presets) are used only inside `lib/enterprise-recipes.ts` to _build_ those recipes; once emitted they become `Record<string, unknown>`.

### React Component Style

All interactive pages use the `"use client"` directive at the top. Hooks used: `useState`, `useEffect`, `useMemo`. No global state library — state is local to each page component. Styling is through `app/styles.css` (plain CSS classes, no CSS-in-JS, no CSS modules). Some inline `style` props appear for one-off dynamic values (e.g., image dimensions). Icons come from `lucide-react`.

Local type definitions are repeated in client components (e.g., `BlobAsset`, `RenderJob` redefined in `app/studio.tsx` and `app/rater/page.tsx`) rather than imported from `@/lib/types` — this is a known inconsistency.

### Async Data Fetching in Routes

All `fetch` calls in server-side lib code use `{ cache: "no-store" }` to prevent stale data. Pattern from `lib/jobs.ts`:

```typescript
const response = await fetch(url, { cache: "no-store" });
if (!response.ok) return null;
return (await response.json()) as RenderJob;
```

---

## Python Layer

### Naming Patterns

**Files:**
- snake_case everywhere: `render_scene.py`, `inspect_materials.py`, `postprocess.py`, `handler.py`
- Recipe-generating scripts: `create_vNNN_<description>.py` — monotonically increasing version number prefix (e.g., `scripts/create_v203_close_pose_angle_set.py`)
- Postprocess experiment scripts: `postprocess_<variant>.py` (e.g., `scripts/postprocess_diamond_variants.py`)

**Functions:**
- snake_case: `deep_merge`, `clear_scene`, `import_model`, `object_signature`, `assign_materials`, `apply_postprocess`
- Private helpers prefixed with `_`: `_clamp`, `_object_bounds`, `_fallback_bounds`, `_object_bounds_mask` (in `workers/runpod-blender/postprocess.py`)

**Variables:**
- snake_case for locals and parameters
- SCREAMING_SNAKE_CASE for module-level constants: `DEFAULT_RECIPE`, `WORKER_DIR`, `BLENDER_SCRIPT`, `ROOT`, `BASE_PATH`, `PRODUCT_TOKENS`

**Recipe version naming:** `vNNN` prefix in both file names and recipe `"name"` field values (e.g., `"v144b_render_dark_reflectors_clean_table"`, `"v203a_close_front_hero"`). Suffixes after the version number are descriptive slugs.

### Blender Script Argument Parsing

All Python scripts that run inside Blender use a fixed pattern to extract arguments after the `--` separator:

```python
import argparse
import sys

def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(argv)
```

Blender is invoked via subprocess with the separator pattern:
```
blender --background --python <script.py> -- --model <path> --recipe <path> --output <path>
```

This pattern appears identically in `workers/runpod-blender/render_scene.py`, `workers/runpod-blender/inspect_materials.py`, and `scripts/blender_render.py`.

### DEFAULT_RECIPE + deep_merge Pattern

`workers/runpod-blender/render_scene.py` defines `DEFAULT_RECIPE` — a large module-level dict with all render, camera, world, material, and light defaults. Incoming recipe JSON is merged on top using `deep_merge`:

```python
def deep_merge(base, override):
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged
```

This means a recipe only needs to specify values that differ from defaults. All recipe-generating scripts use `copy.deepcopy(base)` then mutate the copy — never mutate the shared base.

### object_signature() Token Matching

Object selection in Blender is done by substring token matching against a combined "signature" string that concatenates the object's name and all its material slot names:

```python
def object_signature(obj):
    material_names = " ".join(slot.material.name for slot in obj.material_slots if slot.material)
    return f"{obj.name} {material_names}".lower()
```

Callers pass a list of lowercase token strings and check `any(token in signature for token in tokens)`. This pattern is used for: mesh selection, material assignment, visibility filtering, shade-smooth exclusion, and postprocess region finding. Tokens like `"diamond"`, `"round_5"`, `"prong"`, `"shank"` are REQ-style Blender object name fragments.

### Config-as-Data Recipe Architecture

Render configuration is pure JSON data, not code. Each recipe is a dict with top-level keys: `"render"`, `"camera"`, `"world"`, `"background"`, `"model"`, `"material_strategy"`, `"material_map"`, `"materials"`, `"lights"`, `"reflection_cards"`, `"contact_shadows"`, `"postprocess"`. The `render_scene.py` worker interprets these keys; scripts only produce data.

Recipe-generating scripts (`scripts/create_vNNN_*.py`) follow this pattern:
1. Load a base recipe from `outputs/ring99/recipes/<base>.json` or `recipes/<base>.json`
2. `copy.deepcopy(base)` for each variant
3. Mutate specific keys
4. Write the result as a new JSON file

### Python Module Conventions

- All worker Python files begin with `from __future__ import annotations` for forward reference support
- `Path` from `pathlib` is used for all filesystem operations — no raw string concatenation for paths
- `json.loads` / `json.dumps` with `indent=2` for all recipe serialization
- Error returns from the RunPod handler are plain dicts: `{"error": "...", "stdout": "...", "stderr": "..."}` — not exceptions

### Postprocess Pipeline (postprocess.py)

`workers/runpod-blender/postprocess.py` is a pure Python/Pillow pipeline invoked after Blender renders. It reads the `"postprocess"` key from the recipe. The pipeline applies operations in order: studio_background, product crop/enhance, center_stone enhance, center_stone_symmetry, diamond_facets overlay. Each step is gated by `"enabled": true/false`. Pillow (`PIL`) is the only image dependency; no OpenCV.

---

## Shared Conventions Across Both Layers

**Error responses always contain a single `"error"` key** — in TypeScript routes (`{ error: string }`) and in Python handler returns (`{"error": "...", ...}`).

**Recipe JSON files are the source of truth for render parameters.** Both layers treat JSON recipes as the interface contract. The TypeScript layer passes them opaquely; the Python worker interprets them. This means recipe keys must match exactly between what `buildEnterpriseRecipe` outputs and what `render_scene.py` reads.

**No shared schema validation.** Recipes are not validated against a schema in either layer — the Python worker uses `.get()` with defaults throughout, so extra or missing keys fail silently.

---

*Convention analysis: 2026-06-05*
