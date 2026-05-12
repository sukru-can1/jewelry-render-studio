# Material Preparation

The model file should carry geometry, object names, and placeholder material slots. The cloud worker applies final render materials from recipes.

## Best Input

Preferred first test:

```text
ring_001.glb
```

Also useful:

```text
ring_001_with_materials.blend
```

A `.blend` with existing materials helps us inspect and extract approved shader ideas, but the render pipeline should still apply controlled materials from recipes so variants are repeatable.

## Object Naming

Use predictable names:

```text
band_metal
prongs_metal
basket_metal
center_diamond
side_diamond_left
side_diamond_right
pave_diamond_001
```

Avoid:

```text
Object001
Material.003
mesh_copy_final
gem maybe
```

## Placeholder Slots

Inside GLB/FBX/BLEND, placeholder materials are enough:

```text
METAL
DIAMOND_CENTER
DIAMOND_SIDE
DIAMOND_PAVE
RUBY
SAPPHIRE
EMERALD
```

These are labels. They do not need to look photorealistic.

## Recipe Mapping

The render recipe maps model parts to final materials:

```json
{
  "material_map": [
    {
      "contains": ["metal", "band", "prong", "basket"],
      "material": "white_gold_polished"
    },
    {
      "contains": ["center", "diamond"],
      "material": "diamond_center"
    },
    {
      "contains": ["side", "pave"],
      "material": "diamond_side"
    }
  ],
  "materials": {
    "white_gold_polished": {
      "type": "metal",
      "base_color": [0.86, 0.84, 0.8, 1.0],
      "metallic": 1.0,
      "roughness": 0.14,
      "specular_ior_level": 0.78
    },
    "diamond_center": {
      "type": "gem",
      "base_color": [1.0, 0.98, 0.92, 1.0],
      "roughness": 0.0,
      "alpha": 0.24,
      "transmission_weight": 1.0,
      "ior": 2.417
    }
  }
}
```

## Why This Is Better

One ring model can become many catalog variants:

```text
white gold + diamond
rose gold + ruby
yellow gold + emerald
platinum + sapphire
```

Only the recipe changes. The geometry stays stable.

## Existing Embedded Materials

If the team already embeds materials in `.blend` files, keep doing that for now. We will use those files as source assets, then extract approved materials into a reusable material library.

Do not depend on FBX materials as final truth. FBX often loses or simplifies material data.

## Using A BLEND With Product + Materials

Upload the `.blend` as a model asset to Vercel Blob, then run material inspection from the dashboard. The RunPod worker will open the file in Blender and produce:

```text
material_inventory.json
```

That inventory includes:

```text
object names
object material slots
material names
Principled BSDF values
node names/types
```

Render recipes can use three material modes:

```json
{
  "material_strategy": "source"
}
```

Keep all embedded `.blend` materials exactly as provided.

```json
{
  "material_strategy": "override"
}
```

Replace matched model materials with recipe-controlled render materials. This is the default.

```json
{
  "material_strategy": "hybrid"
}
```

Override only objects matched by `material_map`; keep source materials on everything else.
