# Master Scene: the v203 Studio (`son2.blend`)

Recon findings for the master-scene render pipeline (product-swap port of the
proven v203 approach into the enterprise worker + recipe layer).

## Which .blend is the master scene?

**`blend/son2.blend` (51,869,909 bytes).** Every v190..v203 render job was
submitted with:

```json
{
  "url": "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/son2.blend",
  "pathname": "models/son2.blend"
}
```

(see `scripts/import_v203_angle_set_to_blob.mjs:25-29` and the matching
`import_v19x/v201` scripts — `models/son2.blend` in all of them).
`blend/1scene.blend` (171MB) is never referenced by any submission/import
script. `blend/ring99.blend` belongs to the older standard-import pipeline.

The handler downloads ONE model file (`input.model`); for `source_scene`
recipes that file IS the master .blend — son2.blend carries the whole studio
plus its own reference product.

**Uploaded for the enterprise pipeline (PRIVATE blob):**
`master-scenes/v203-studio.blend` — via `scripts/upload_master_scene_blend.ts`
(`putPrivate`, multipart). Workers fetch it through a short-lived presigned URL
minted at dispatch (`lib/blob.ts` `workerModelUrl`), same as product models.

## What is inside son2.blend (as driven by the recipes)

The "v201 physical-card studio": camera, lights and cards are hand-placed in
the .blend; recipes only adjust them by name token.

| Element | Names (tokens used by recipes) |
|---|---|
| Camera | the scene's active camera, used VERBATIM (v203 explicitly pops `camera_orbit` — no orbit, no recipe camera) |
| Lights | `large_front_left_softbox`, `weak_front_right_fill`, `low_top_softbox`, `diamond_micro_sparkle` (driven via `source_scene.light_adjustments` `power_scale`/`color`) |
| Studio helper meshes | `NEWS_FINAL_diamond_dark_facet_card`, `MASTER_SCENE_soft_gray_side_reflection` (driven via `object_adjustments.source_material_adjust`) |
| Source materials | `MASTER_SCENE_realistic_polished_gold`, `MASTER_SCENE_clear_cut_diamond_glass`, `Dimond`, `Shiny Gold` (referenced by `material_map.source_material`) |
| Reference product | `Diamond_Round*` (center stone = `Diamond_Round_11`), `Prong*`, band meshes carrying `Shiny Gold` / `MASTER_SCENE_realistic_polished_gold` |

Reference-product token set (the v203 `PRODUCT_TOKENS`, now the default
`master_scene.reference_contains`):

```json
["Diamond_Round", "Prong", "MASTER_SCENE_realistic_polished_gold", "Shiny Gold"]
```

## How the v203 recipes drive the scene

- `source_scene: { enabled: true, apply_recipe_materials: true }` — render
  INSIDE the master .blend; recipe `material_map` re-maps the product
  materials (hybrid strategy, `source_material` + `source_material_adjust`).
- **Each catalog angle = a PRODUCT POSE change, camera fixed.** One
  `group_adjustments` entry matches the product tokens and applies
  rotation/scale/translation about the group's bbox center:

| v203 recipe | label | rotation XYZ (deg) | scale | translation | exposure |
|---|---|---|---|---|---|
| v203a_close_front_hero | close front hero | [-16, 0, -16] | 0.95 | [0, 0, -0.01] | -0.94 |
| v203b_close_catalog_left | close catalog left | [0, 0, -34] | 0.91 | [-0.004, 0, -0.01] | -0.95 |
| v203c_close_catalog_right | close catalog right | [0, 0, 34] | 0.91 | [0.004, 0, -0.01] | -0.95 |
| v203d_close_low_side | close low side profile | [-7, 0, -74] | 0.88 | [0, 0, -0.008] | -0.96 |
| v203e_close_upper_ring_shape | close upper ring shape | [12, 0, -26] | 0.9 | [0, 0, -0.006] | -0.93 |

- Light trim (identical in all five): front softbox ×0.84, right fill ×0.58,
  top softbox ×0.52, `diamond_micro_sparkle` ×2.18 with cool color
  `[0.93, 0.975, 1.0]`.
- Three `adaptive_reflection_card_*` planes added per render (glossy +
  transmission only) — left dark facet break, right soft lift, top narrow dark.
- Render: 1100×1100, 680 samples, Filmic / Medium High Contrast, per-pose
  exposure (table above).

Lineage: v203 (pose angle set) ← v201 (final physical-card studio recipe,
900 samples @ 1200) ← v200 (added the physical cards over v193a) ← v193a —
all on son2.blend since the v15x sweeps.

## Enterprise port (master_scene pipeline)

The enterprise worker generalizes this with a PRODUCT SWAP (legacy
`external-work/cloud-renderer-glmr/blender_scripts.py` ~830-955):

1. `bpy.ops.wm.open_mainfile(master)` — the studio is the scene.
2. MEASURE the reference product (objects matching
   `master_scene.reference_contains` via `object_signature`): bbox center +
   max dimension.
3. DELETE the reference objects (delete, not hide — frees names).
4. IMPORT the uploaded product (`input.model`), flatten + single product pivot.
5. NORMALIZE onto the reference: stand-upright/orient (`auto_orient_model`),
   scale to the reference max-dim, translate so the product bbox center lands
   on the reference center — one composed matrix on the pivot.
6. Per-angle PRODUCT POSE: `master_scene.pose_rotation_degrees`
   (+ `pose_scale` / `pose_translation`) about the reference center.
7. Recipe materials (`material_map`), layered-pass visibility
   (`model.pass_hide_contains` / `pass_holdout_contains`), master scene's own
   camera/lights kept (no procedural studio), `light_adjustments` /
   `object_adjustments` / `reflection_cards` honored from `master_scene.*`.

Recipes are produced by `buildMasterSceneRecipe` (`lib/master-scene-recipes.ts`,
re-exported from `lib/enterprise-recipes.ts`). Handler input gains an optional
`input.master_scene = { url, pathname }` downloaded alongside the product and
passed to `render_scene.py` via `--master`.

TODO (out of scope for v1): app dispatch wiring (`dispatch.ts` passing
`input.master_scene`), batch-builder toggle, gallery integration.
