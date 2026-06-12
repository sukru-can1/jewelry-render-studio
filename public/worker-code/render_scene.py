from __future__ import annotations

import argparse
import json
import math
import tempfile
import urllib.request
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Euler, Matrix, Vector


# Deploy-verification build marker. UPDATE THIS TOKEN ON EVERY EDIT to
# render_scene.py — it is printed at main() start and written into the render
# metadata JSON, so a stale RunPod image or cached worker-code download is
# detectable from any job's stdout and metadata without guessing.
WORKER_BUILD = "20260612-master-scene-r10"


DEFAULT_RECIPE = {
    "render": {
        "resolution": [1400, 1400],
        "samples": 192,
        "denoise": True,
        "view_transform": "Filmic",
        "look": "Medium High Contrast",
        "exposure": 0.0,
        "gamma": 1.0,
        "transparent": False,
    },
    "camera": {
        "position": [0.0, -4.2, 2.1],
        "target": [0.0, 0.0, 0.32],
        "focal_length": 90,
        "depth_of_field": {"enabled": True, "f_stop": 7.5},
    },
    "world": {"color": [1.0, 1.0, 1.0], "strength": 0.18},
    "background": {"color": [0.98, 0.98, 0.965, 1.0], "plane_size": 8.0, "plane_z": -0.04},
    "model": {
        "auto_orient": False,
        "auto_center": True,
        "auto_scale": True,
        "target_size": 2.0,
        "rotation_degrees": [0.0, 0.0, 0.0],
        "ground_to_plane": True,
        "ground_clearance": 0.015,
        "shade_smooth": True,
        "shade_smooth_exclude_contains": ["diamond", "stone", "gem", "round_", "emerald", "zirconia", "brillant"],
        "include_contains": [],
        "exclude_contains": ["light", "camera", "cube", "helper", "swatch", "plane"],
    },
    "material_strategy": "override",
    "material_map": [
        {"contains": ["metal", "band", "prong", "basket", "shank"], "material": "white_gold_polished"},
        {"contains": ["center", "diamond", "stone", "gem"], "material": "diamond_center"},
        {"contains": ["side", "pave"], "material": "diamond_side"},
    ],
    "materials": {
        "white_gold_polished": {
            "type": "metal",
            "base_color": [0.86, 0.84, 0.8, 1.0],
            "metallic": 1.0,
            "roughness": 0.14,
            "specular_ior_level": 0.78,
        },
        "diamond_center": {
            "type": "gem",
            "base_color": [1.0, 0.98, 0.92, 1.0],
            "roughness": 0.0,
            "alpha": 0.24,
            "transmission_weight": 1.0,
            "ior": 2.417,
        },
        "diamond_side": {
            "type": "gem",
            "base_color": [1.0, 0.98, 0.94, 1.0],
            "roughness": 0.0,
            "alpha": 0.3,
            "transmission_weight": 1.0,
            "ior": 2.417,
        },
    },
    "lights": [
        {"name": "large_top_softbox", "type": "AREA", "position": [0.0, -1.6, 3.0], "rotation_degrees": [62, 0, 0], "size": 3.2, "power": 520},
        {"name": "left_front_strip", "type": "AREA", "position": [-2.4, -2.4, 1.2], "rotation_degrees": [70, 0, -34], "size": 1.1, "power": 160},
        {"name": "right_rim_strip", "type": "AREA", "position": [2.3, -0.2, 1.4], "rotation_degrees": [78, 0, 45], "size": 0.75, "power": 125},
        {"name": "diamond_sparkle_pin_1", "type": "POINT", "position": [-0.65, -1.15, 1.45], "power": 55, "shadow_soft_size": 0.018},
        {"name": "diamond_sparkle_pin_2", "type": "POINT", "position": [0.82, -1.35, 1.75], "power": 38, "shadow_soft_size": 0.012},
    ],
    "reflection_cards": [
        {
            "name": "dark_lower_reflection",
            "position": [0.0, -2.8, 0.35],
            "rotation_degrees": [72.0, 0.0, 0.0],
            "size": [3.6, 0.75],
            "color": [0.035, 0.035, 0.038, 1.0],
            "visible_to_camera": False,
        },
        {
            "name": "soft_gray_side_reflection",
            "position": [2.4, -1.6, 0.85],
            "rotation_degrees": [65.0, 0.0, 58.0],
            "size": [1.8, 1.15],
            "color": [0.38, 0.38, 0.39, 1.0],
            "visible_to_camera": False,
        },
    ],
}


def deep_merge(base, override):
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    # Optional master-scene studio .blend: master_scene.enabled recipes open
    # this file as the scene and swap its reference product for --model.
    parser.add_argument("--master", default=None)
    import sys

    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def flatten_hierarchy(objects):
    """Unparent every imported object while preserving its world transform.

    FBX scenes often parent meshes under EMPTY nodes with non-trivial
    matrix_parent_inverse; repeated matrix_world writes on such children can
    diverge between the set value and the evaluated render transform. A
    keep-transform unparent is a pose no-op that makes every later
    matrix_world write exact.
    """
    bpy.context.view_layer.update()
    for obj in sorted(objects, key=lambda item: item.name):
        if obj.parent is not None:
            world = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = world
    bpy.context.view_layer.update()


def create_product_pivot(objects):
    """Create ONE world-origin EMPTY and parent every imported mesh to it.

    Per-object matrix_world writes proved unreliable on imported FBX scenes —
    live renders showed meshes scattering non-deterministically, and the
    flatten-unparent pass reduced but did not cure it. With a single pivot,
    every whole-product transform (auto_orient, auto_center/auto_scale,
    rotation_degrees, translation, ground_to_plane) is exactly ONE matrix
    write on ONE object; the meshes follow through evaluated parenting, so
    there is nothing left to diverge across objects.

    flatten_hierarchy has already run, so each mesh's matrix_basis equals its
    world matrix. With the pivot at identity and matrix_parent_inverse forced
    to Identity, world = pivot @ I @ basis = basis — parenting is an exact
    pose no-op.
    """
    pivot = bpy.data.objects.new("product_pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    for obj in objects:
        obj.parent = pivot
        obj.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return pivot


def import_model(path: Path):
    before = set(bpy.data.objects)
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    elif suffix == ".blend":
        with bpy.data.libraries.load(str(path), link=False) as (source, target):
            target.objects = source.objects
            target.materials = source.materials
        for obj in target.objects:
            if obj:
                bpy.context.collection.objects.link(obj)
    else:
        raise ValueError(f"Unsupported model type: {suffix}")
    imported = [obj for obj in bpy.data.objects if obj not in before]
    flatten_hierarchy(imported)
    return [obj for obj in imported if obj.type == "MESH"]


def source_scene_mesh_objects(recipe):
    config = recipe.get("source_scene", {})
    include = [token.lower() for token in config.get("metadata_include_contains", [])]
    exclude = [token.lower() for token in config.get("metadata_exclude_contains", [])]
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        signature = object_signature(obj)
        if include and not any(token in signature for token in include):
            continue
        if exclude and any(token in signature for token in exclude):
            continue
        selected.append(obj)
    return selected


def setup_source_scene(path: Path, recipe):
    config = recipe.get("source_scene", {})
    bpy.ops.wm.open_mainfile(filepath=str(path))

    scene_name = config.get("scene_name")
    if scene_name and scene_name in bpy.data.scenes:
        bpy.context.window.scene = bpy.data.scenes[scene_name]

    camera_name = config.get("camera_name")
    if camera_name and camera_name in bpy.data.objects and bpy.data.objects[camera_name].type == "CAMERA":
        bpy.context.scene.camera = bpy.data.objects[camera_name]

    setup_render(recipe)

    if config.get("use_recipe_camera", False):
        setup_camera(recipe)

    if config.get("apply_recipe_materials", False):
        assign_materials(source_scene_mesh_objects(recipe), recipe)

    apply_source_scene_adjustments(recipe)
    apply_source_camera_adjustment(recipe)
    add_reflection_cards_from_configs(config.get("reflection_cards", []))

    return source_scene_mesh_objects(recipe)


def measure_reference_product(config):
    """Find the master scene's built-in reference product via
    master_scene.reference_contains tokens (object_signature matching) and
    measure its placement envelope BEFORE deletion. The envelope (bbox center +
    max dimension) is the placement contract the uploaded product is normalized
    onto — the legacy hand-measured REF_CENTER/REF_MAXDIM constants
    (external-work blender_scripts.py ~893), now measured live so any master
    .blend works without baked-in numbers."""
    tokens = [token.lower() for token in config.get("reference_contains", [])]
    if not tokens:
        raise RuntimeError("master_scene.reference_contains must list the reference product tokens.")
    matched = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and any(token in object_signature(obj) for token in tokens)
    ]
    if not matched:
        raise RuntimeError("No reference product meshes matched master_scene.reference_contains.")
    return matched, bounds_summary(matched)


def delete_reference_product(objects):
    """DELETE (not hide) the reference meshes — deletion frees their object
    names so the imported product keeps its original names for token matching
    (legacy product-swap lesson, blender_scripts.py ~831-840)."""
    names = sorted(obj.name for obj in objects)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    return names


def place_product_on_reference(objects, settings, reference, pivot):
    """Normalize the imported product onto the measured reference envelope.

    Legacy single-composed-matrix placement (blender_scripts.py ~906-927), on
    the product PIVOT: stand upright / orient head via auto_orient_model
    (rotations preserve lengths, so the max dimension — and therefore the
    scale below — is unaffected), then ONE world-space matrix: translate the
    product bbox center to the origin -> scale to the reference max dimension
    -> translate to the reference center."""
    apply_shade_smooth(objects, settings)
    auto_orient_model(objects, settings, pivot)

    mins, maxs = object_bounds(objects)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    current_max = max(size.x, size.y, size.z)
    ref_center = Vector(reference["center"])
    ref_maxdim = float(reference["max_dimension"])
    scale = ref_maxdim / current_max if current_max > 0 else 1.0
    pivot.matrix_world = (
        Matrix.Translation(ref_center) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    ) @ pivot.matrix_world
    bpy.context.view_layer.update()
    print(
        f"MASTER_PLACE: scaled x{scale:.4f} onto reference "
        f"center=({ref_center.x:.4f}, {ref_center.y:.4f}, {ref_center.z:.4f}) maxdim={ref_maxdim:.5f}"
    )
    return scale


def apply_master_pose(config, reference, pivot):
    """Per-angle PRODUCT POSE about the reference center — the v203 contract:
    the studio camera is FIXED; rotating/scaling/nudging the product creates
    the catalog angles. Mirrors the group_adjustments math (scale about the
    center, rotate, then translate) as one composed matrix on the pivot."""
    rotation = [math.radians(float(v)) for v in config.get("pose_rotation_degrees", [0.0, 0.0, 0.0])]
    scale = float(config.get("pose_scale", 1.0))
    translation = transform_vector(config.get("pose_translation", [0, 0, 0]), 0.0)
    center = Vector(reference["center"])
    pose = (
        Matrix.Translation(center + translation)
        @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        @ Matrix.Scale(scale, 4)
        @ Matrix.Translation(-center)
    )
    pivot.matrix_world = pose @ pivot.matrix_world
    bpy.context.view_layer.update()


def apply_master_camera_hide(config, product_objects):
    """master_scene.camera_hide_contains: studio meshes matching these tokens
    get visible_camera=False — they keep LIGHTING the product (diffuse/glossy/
    transmission bounce preserved) but stop painting pixels. The legacy stone-
    pass lesson: never delete the floor for stone layers; hide it from camera
    only, so render.transparent ships pure stones-on-alpha. Product meshes are
    exempt — their pass behavior is owned by apply_pass_visibility."""
    tokens = [token.lower() for token in config.get("camera_hide_contains", [])]
    if not tokens:
        return []
    product = set(product_objects)
    hidden = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj in product:
            continue
        if any(token in object_signature(obj) for token in tokens) and hasattr(obj, "visible_camera"):
            obj.visible_camera = False
            hidden.append(obj.name)
    return hidden


def preserve_camera_focus(reference_objects):
    """Pin the authored camera's DOF before the reference product is deleted.

    The master-scene invariant is that every swapped product is normalized onto
    the reference envelope, so the artist's hand-focused camera stays correct
    for ANY product — the authored DOF must be PRESERVED, not recomputed (the
    bbox-center/f16 refocus rendered the whole product soft at macro scale:
    live batch cmqaqwh38, GPT verdict overall=1 on both angles).

    The one real hazard: the authored camera may use dof.focus_object pointing
    AT a reference mesh — deletion would dangle it and Blender falls back to a
    stale focus_distance scalar. Bake the object-focus into the scalar BEFORE
    deletion and clear the object reference.
    """
    camera = bpy.context.scene.camera
    if camera is None or not getattr(camera.data, "dof", None):
        return None
    focus_object = camera.data.dof.focus_object
    if focus_object is None or focus_object not in set(reference_objects):
        return None
    distance = (focus_object.matrix_world.translation - camera.matrix_world.translation).length
    camera.data.dof.focus_object = None
    camera.data.dof.focus_distance = distance
    print(
        f"MASTER_FOCUS: baked focus_object '{focus_object.name}' into focus_distance={distance:.5f} "
        "before reference deletion"
    )
    return {"baked_from": focus_object.name, "focus_distance": distance}


def refocus_master_camera(config, product_objects):
    """OPT-IN camera focus override after the product swap.

    Runs ONLY when the recipe explicitly carries master_scene.depth_of_field —
    the authored camera's DOF is the default (see preserve_camera_focus).
    Overrides apply ONLY the keys provided: enabled -> use_dof, f_stop ->
    aperture_fstop, focus_distance -> scalar focus; absent keys keep the
    authored values. The focus target defaults to the swapped product's bbox
    center (+ focus_target_offset) when focus_distance is not given.
    """
    dof = config.get("depth_of_field")
    if not dof:
        return None
    camera = bpy.context.scene.camera
    if camera is None or not product_objects:
        return None

    mins, maxs = object_bounds(product_objects)
    target = (mins + maxs) * 0.5
    offset = config.get("focus_target_offset", [0.0, 0.0, 0.0])
    target += Vector((float(offset[0]), float(offset[1]), float(offset[2])))

    camera.data.dof.focus_object = None
    if "enabled" in dof:
        camera.data.dof.use_dof = bool(dof["enabled"])
    if "focus_distance" in dof:
        camera.data.dof.focus_distance = float(dof["focus_distance"])
    else:
        camera.data.dof.focus_distance = (target - camera.location).length
    if "f_stop" in dof:
        camera.data.dof.aperture_fstop = float(dof["f_stop"])
    return {
        "target": list(target),
        "focus_distance": camera.data.dof.focus_distance,
        "f_stop": camera.data.dof.aperture_fstop,
        "use_dof": camera.data.dof.use_dof,
    }


def apply_master_camera_orbit(config, reference):
    """Catalog-angle camera orbit — the legacy Flask app's proven framing,
    ported VERBATIM (external-work blender_scripts.py ~1197-1214).

    The four catalog views (view1/view2/view4/Camera) are azimuth/elevation
    orbits about the REFERENCE CENTER at distance = max_dim * 3.5 *
    distance_scale, look-at center, with the legacy f/2.8 focus-on-center DOF
    (center stone sharp, far band softens — the catalog look). The product
    stays in its reference pose; this REPLACES the authored close-up camera
    position for the render. Opt-in: absent camera_orbit keeps the authored
    v203 close camera untouched.
    """
    orbit = config.get("camera_orbit")
    if not orbit:
        return None
    camera = bpy.context.scene.camera
    if camera is None:
        return None

    center = Vector(reference["center"])
    distance = (
        float(orbit.get("distance_scale", 1.0)) * float(reference["max_dimension"]) * 3.5
    )
    az = math.radians(float(orbit.get("azimuth", 30.0)))
    el = math.radians(float(orbit.get("elevation", 25.0)))
    camera.location = Vector(
        (
            center.x + distance * math.cos(el) * math.sin(az),
            center.y - distance * math.cos(el) * math.cos(az),
            center.z + distance * math.sin(el),
        )
    )
    look_at(camera, center)
    if "focal_length" in orbit and hasattr(camera.data, "lens"):
        camera.data.lens = float(orbit["focal_length"])
    # The authored close-up camera may carry sensor shift / clip values that
    # are wrong for an orbit framing — neutralize them.
    if hasattr(camera.data, "shift_x"):
        camera.data.shift_x = 0.0
        camera.data.shift_y = 0.0
    camera.data.clip_start = min(camera.data.clip_start, distance * 0.05)
    camera.data.dof.use_dof = True
    camera.data.dof.focus_object = None
    camera.data.dof.focus_distance = distance
    camera.data.dof.aperture_fstop = float(orbit.get("fstop", 2.8))
    print(
        f"MASTER_ORBIT: az={math.degrees(az):.1f} el={math.degrees(el):.1f} "
        f"dist={distance:.5f} lens={camera.data.lens:.1f} fstop={camera.data.dof.aperture_fstop}"
    )
    return {
        "azimuth": math.degrees(az),
        "elevation": math.degrees(el),
        "distance": distance,
        "focal_length": camera.data.lens,
        "fstop": camera.data.dof.aperture_fstop,
    }


def setup_master_scene(master_path: Path, model_path: Path, recipe):
    """Master-scene product swap — the proven v203 pipeline, generalized.

    Renders INSIDE the human-authored studio .blend (its camera, lights and
    cards ARE the look) and swaps the built-in reference product for the
    uploaded model: open mainfile -> measure + delete the reference -> import
    the product (flatten + single pivot) -> normalize onto the reference
    envelope -> per-angle pose -> pass visibility -> recipe materials -> scene
    adjustments. The procedural studio builders (setup_background, add_lights,
    add_reflection_cards, setup_camera, add_contact_shadows) are deliberately
    NOT called — the master scene owns all of that."""
    config = recipe.get("master_scene", {})
    bpy.ops.wm.open_mainfile(filepath=str(master_path))

    scene_name = config.get("scene_name")
    if scene_name and scene_name in bpy.data.scenes:
        bpy.context.window.scene = bpy.data.scenes[scene_name]

    camera_name = config.get("camera_name")
    if camera_name and camera_name in bpy.data.objects and bpy.data.objects[camera_name].type == "CAMERA":
        bpy.context.scene.camera = bpy.data.objects[camera_name]

    setup_render(recipe)

    reference_objects, reference = measure_reference_product(config)
    # Bake any object-targeted authored DOF into a scalar BEFORE the focus
    # target is deleted with the reference product (authored DOF is the look).
    preserved_focus = preserve_camera_focus(reference_objects)
    deleted = delete_reference_product(reference_objects)

    before_import = set(bpy.data.objects)
    objects = import_model(model_path)
    if not objects:
        raise RuntimeError("Uploaded product contains no mesh objects.")
    # Uploaded product files routinely embed their own LIGHT/CAMERA objects
    # (FBX/GLTF exports, saved .blend working files). In the standard path they
    # land in a procedural scene; HERE they would silently re-light the hand-
    # authored studio — the entire point of the master scene is that ITS
    # camera/lights are the look. Remove imported non-mesh objects (EMPTYs are
    # kept: already unparented by flatten_hierarchy and they do not render).
    for obj in [o for o in bpy.data.objects if o not in before_import and o.type in {"LIGHT", "CAMERA"}]:
        print(f"MASTER_SWAP: dropping imported {obj.type} '{obj.name}' (master scene owns lighting/camera)")
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    pivot = create_product_pivot(objects)
    imported_bounds = bounds_summary(objects)
    scale = place_product_on_reference(objects, recipe["model"], reference, pivot)
    apply_master_pose(config, reference, pivot)
    placed_bounds = bounds_summary(objects)

    # Same order as the standard path: pass visibility FIRST (its tokens match
    # the product's ORIGINAL material names), then recipe material assignment.
    apply_pass_visibility(objects, recipe["model"])
    if config.get("apply_recipe_materials", True):
        assign_materials(objects, recipe)

    apply_scene_adjustments(config)
    add_reflection_cards_from_configs(config.get("reflection_cards", []))
    hidden = apply_master_camera_hide(config, objects)
    focus = refocus_master_camera(config, objects)
    # Catalog-angle orbit LAST — when present it owns the camera entirely
    # (position, look-at, lens, DOF), overriding the authored close framing.
    orbit = apply_master_camera_orbit(config, reference)

    return objects, {
        "reference": {**reference, "deleted_objects": deleted},
        "product": {
            "imported": imported_bounds,
            "placed": placed_bounds,
            "scale_to_reference": scale,
        },
        "camera_hidden_objects": hidden,
        "camera_focus": focus,
        "camera_focus_preserved": preserved_focus,
        "camera_orbit": orbit,
    }


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def source_camera_target(config):
    tokens = [token.lower() for token in config.get("target_contains", ["Diamond_Round_11"])]
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and any(token in object_signature(obj) for token in tokens)]
    if objects:
        mins, maxs = object_bounds(objects)
        return (mins + maxs) * 0.5
    return Vector(config.get("target", [0.0, 0.0, 0.0]))


def apply_source_camera_adjustment(recipe):
    config = recipe.get("source_scene", {}).get("camera_orbit", {})
    if not config.get("enabled", False):
        return
    camera = bpy.context.scene.camera
    if camera is None:
        return

    target = source_camera_target(config)
    if "target_offset" in config:
        target += Vector(config["target_offset"])

    relative = camera.location - target
    distance_scale = float(config.get("distance_scale", 1.0))
    relative *= distance_scale

    yaw = math.radians(float(config.get("yaw_degrees", 0.0)))
    cos_y = math.cos(yaw)
    sin_y = math.sin(yaw)
    relative = Vector((relative.x * cos_y - relative.y * sin_y, relative.x * sin_y + relative.y * cos_y, relative.z))

    if "height_scale" in config:
        relative.z *= float(config["height_scale"])
    if "height_offset" in config:
        relative.z += float(config["height_offset"])

    camera.location = target + relative
    look_at(camera, target)

    if "focal_length" in config and hasattr(camera.data, "lens"):
        camera.data.lens = float(config["focal_length"])
    if "shift_x" in config and hasattr(camera.data, "shift_x"):
        camera.data.shift_x = float(config["shift_x"])
    if "shift_y" in config and hasattr(camera.data, "shift_y"):
        camera.data.shift_y = float(config["shift_y"])


def apply_scene_adjustments(config):
    """Token-matched scene adjustments (group/object/light), shared core for
    the source-scene AND master-scene paths: the config dict carries
    group_adjustments / object_adjustments / light_adjustments. Extracted
    verbatim from apply_source_scene_adjustments."""
    for adjustment in config.get("group_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        matched = [
            obj
            for obj in bpy.context.scene.objects
            if obj.type == "MESH" and not obj.hide_render and any(token in object_signature(obj) for token in tokens)
        ]
        if not matched:
            continue
        mins, maxs = object_bounds(matched)
        pivot = (mins + maxs) * 0.5
        if "pivot" in adjustment:
            pivot = Vector(adjustment["pivot"])
        rotation = [math.radians(float(v)) for v in adjustment.get("rotation_degrees", [0.0, 0.0, 0.0])]
        rotation_matrix = Euler(rotation, "XYZ").to_matrix().to_4x4()
        scale = transform_vector(adjustment.get("scale", 1.0), 1.0)
        translation = transform_vector(adjustment.get("translation", [0, 0, 0]), 0.0)
        for obj in matched:
            relative = obj.location - pivot
            relative = Vector((relative.x * scale.x, relative.y * scale.y, relative.z * scale.z))
            obj.location = pivot + (rotation_matrix @ relative) + translation
            obj.rotation_euler.rotate(Euler(rotation, "XYZ"))
            obj.scale.x *= scale.x
            obj.scale.y *= scale.y
            obj.scale.z *= scale.z

    for adjustment in config.get("object_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH" or not any(token in object_signature(obj) for token in tokens):
                continue
            if "hide_render" in adjustment:
                obj.hide_render = bool(adjustment["hide_render"])
            if "hide_viewport" in adjustment:
                obj.hide_viewport = bool(adjustment["hide_viewport"])
            if "position" in adjustment:
                obj.location = Vector(adjustment["position"])
            if "rotation_degrees" in adjustment:
                obj.rotation_euler = [math.radians(v) for v in adjustment["rotation_degrees"]]
            if "scale" in adjustment:
                obj.scale = transform_vector(adjustment["scale"])
            material_adjust = adjustment.get("source_material_adjust")
            if material_adjust:
                for slot in obj.material_slots:
                    if slot.material:
                        slot.material = adjust_source_material(slot.material, material_adjust)

    for adjustment in config.get("light_adjustments", []):
        tokens = [token.lower() for token in adjustment.get("contains", [])]
        if not tokens:
            continue
        for obj in bpy.context.scene.objects:
            if obj.type != "LIGHT" or not any(token in obj.name.lower() for token in tokens):
                continue
            data = obj.data
            if "hide_render" in adjustment:
                obj.hide_render = bool(adjustment["hide_render"])
            if "position" in adjustment:
                obj.location = Vector(adjustment["position"])
            if "rotation_degrees" in adjustment:
                obj.rotation_euler = [math.radians(v) for v in adjustment["rotation_degrees"]]
            if "power" in adjustment:
                data.energy = float(adjustment["power"])
            if "power_scale" in adjustment:
                data.energy *= float(adjustment["power_scale"])
            if "size" in adjustment and hasattr(data, "size"):
                data.size = float(adjustment["size"])
            if "size_y" in adjustment and hasattr(data, "size_y"):
                data.size_y = float(adjustment["size_y"])
            if "color" in adjustment:
                data.color = adjustment["color"][:3]


def apply_source_scene_adjustments(recipe):
    apply_scene_adjustments(recipe.get("source_scene", {}))


def filter_product_objects(objects, settings):
    include = [token.lower() for token in settings.get("include_contains", [])]
    exclude = [token.lower() for token in settings.get("exclude_contains", [])]
    selected = []
    for obj in objects:
        signature = f"{obj.name} {' '.join(slot.material.name for slot in obj.material_slots if slot.material)}".lower()
        if include and not any(token in signature for token in include):
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        if exclude and any(token in signature for token in exclude):
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        selected.append(obj)
    return selected


def auto_orient_model(objects, settings, pivot=None):
    """Legacy 'stand upright + orient head' normalization (model.auto_orient).

    Ported from the legacy master-scene placement: uploaded models often import
    lying flat. Step 1 stands the product upright — the thinnest bbox axis (the
    band depth) is rotated to align with Y, matching our camera convention
    (camera looks from -Y toward origin). Step 2 rotates about Y around the
    product bbox center so the head (stones/setting) points +Z. Rotations
    preserve lengths, so the max dimension — and therefore auto_scale — is
    unaffected. Must run BEFORE the auto_center/auto_scale bounds are computed
    (and before ground_to_plane) so centering, scaling and grounding all operate
    on the upright pose. Default False: absent flag = behavior unchanged.

    With a product pivot (single-pivot architecture) both rotations are single
    writes on the pivot's matrix_world; bounds are still read from the meshes'
    evaluated matrix_world. pivot=None falls back to legacy per-object writes
    so callers without a pivot (none in the standard path) keep old behavior.
    """
    if not settings.get("auto_orient", False):
        return

    mins, maxs = object_bounds(objects)
    center = (mins + maxs) * 0.5
    dims = maxs - mins
    thin = min(range(3), key=lambda axis: dims[axis])
    if thin == 0:
        rotation = Matrix.Rotation(math.radians(90), 4, "Z")  # X thinnest -> bring to Y
    elif thin == 2:
        rotation = Matrix.Rotation(math.radians(90), 4, "X")  # Z thinnest -> bring to Y
    else:
        rotation = Matrix.Identity(4)  # already upright
    upright = Matrix.Translation(center) @ rotation @ Matrix.Translation(-center)
    if pivot is not None:
        pivot.matrix_world = upright @ pivot.matrix_world
    else:
        for obj in objects:
            obj.matrix_world = upright @ obj.matrix_world
    bpy.context.view_layer.update()

    # Head matching uses object_signature (name + materials) — a superset of the
    # legacy name-only match, so material names like "Diamond.001" also hit.
    head_tokens = (
        "diamond", "gem", "stone", "ruby", "sapphire", "emerald", "amethyst", "topaz",
        "garnet", "opal", "pearl", "zirconia", "brillant", "prong", "head", "setting",
        "basket", "bezel", "halo",
    )
    head_objects = [obj for obj in objects if any(token in object_signature(obj) for token in head_tokens)]
    if not head_objects:
        head_objects = list(objects)

    head_center = Vector((0.0, 0.0, 0.0))
    corner_count = 0
    for obj in head_objects:
        for corner in obj.bound_box:
            head_center += obj.matrix_world @ Vector(corner)
            corner_count += 1

    head_degrees = 0.0
    if corner_count:
        head_center /= corner_count
        mins, maxs = object_bounds(objects)
        center = (mins + maxs) * 0.5
        dx = head_center.x - center.x
        dz = head_center.z - center.z
        if (dx * dx + dz * dz) > 1e-8:
            phi = math.atan2(dx, dz)  # head direction angle from +Z toward +X
            head_matrix = Matrix.Translation(center) @ Matrix.Rotation(-phi, 4, "Y") @ Matrix.Translation(-center)
            if pivot is not None:
                pivot.matrix_world = head_matrix @ pivot.matrix_world
            else:
                for obj in objects:
                    obj.matrix_world = head_matrix @ obj.matrix_world
            bpy.context.view_layer.update()
            head_degrees = math.degrees(-phi)

    print(f"AUTO_ORIENT: thin axis {'XYZ'[thin]} -> Y, head rotated {head_degrees:.1f} deg about Y")


def apply_shade_smooth(objects, settings):
    """Shade-smooth pass (model.shade_smooth + shade_smooth_exclude_contains),
    extracted verbatim from normalize() so the master-scene path can reuse it
    without pulling in the auto_center/auto_scale normalization (the master
    path normalizes onto the measured REFERENCE envelope instead)."""
    if not settings.get("shade_smooth", True):
        return
    smooth_exclude = [token.lower() for token in settings.get("shade_smooth_exclude_contains", [])]
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if any(token in object_signature(obj) for token in smooth_exclude):
            bpy.ops.object.shade_flat()
        else:
            bpy.ops.object.shade_smooth()
        obj.select_set(False)


def normalize(objects, settings, pivot=None):
    apply_shade_smooth(objects, settings)

    auto_orient_model(objects, settings, pivot)

    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)

    center = (mins + maxs) * 0.5
    size = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z)
    scale = settings.get("target_size", 2.0) / size if settings.get("auto_scale", True) and size > 0 else 1.0
    # Legacy master-scene approach: ONE composed world-space matrix applied to
    # matrix_world. Translating the product center to the origin and then
    # scaling about the world origin == scaling about the product center.
    # The previous per-object `obj.location -= center` / `obj.scale *= scale`
    # only composed correctly under accidental invariants (coincident object
    # origins straight from import) and broke once auto_orient_model rewrote
    # matrix_world with rotations — the product was flung out of frame.
    # Single-pivot architecture: the composed matrix is written to the PIVOT
    # only — even per-object matrix_world loops scattered FBX meshes
    # non-deterministically in live renders, one write on one object cannot.
    translation = Matrix.Translation(-center) if settings.get("auto_center", True) else Matrix.Identity(4)
    matrix = Matrix.Scale(scale, 4) @ translation
    if pivot is not None:
        pivot.matrix_world = matrix @ pivot.matrix_world
    else:
        for obj in objects:
            obj.matrix_world = matrix @ obj.matrix_world
    bpy.context.view_layer.update()


def transform_vector(value, default=1.0):
    if isinstance(value, (int, float)):
        return Vector((float(value), float(value), float(value)))
    if isinstance(value, list):
        values = [float(item) for item in value]
        if len(values) == 2:
            return Vector((values[0], values[1], default))
        if len(values) >= 3:
            return Vector((values[0], values[1], values[2]))
    return Vector((default, default, default))


def apply_object_transforms(objects, model_settings):
    """Recipe-targeted PER-OBJECT transforms (model.object_transforms).

    Intentionally NOT routed through the product pivot: this moves token-
    matched subsets relative to the rest of the product, so per-object writes
    are the point here. CAVEAT (single-pivot architecture): meshes are now
    parented to product_pivot, so `obj.location` below is PIVOT-LOCAL while
    the bounds-derived pivot point is WORLD-space — the frames coincide only
    while the pivot is identity. After normalize() the offsets are interpreted
    in the imported model's pre-normalize frame (unscaled, unoriented units).
    Accepted trade-off: object_transforms is a rarely-used escape hatch and
    keeping it byte-stable was chosen over re-deriving it in pivot space.
    """
    transforms = model_settings.get("object_transforms", [])
    if not transforms:
        return

    for transform in transforms:
        contains = [token.lower() for token in transform.get("contains", [])]
        if not contains:
            continue
        matched = [obj for obj in objects if any(token in object_signature(obj) for token in contains)]
        if not matched:
            continue

        mins, maxs = object_bounds(matched)
        pivot = (mins + maxs) * 0.5
        scale = transform_vector(transform.get("scale", 1.0), 1.0)
        translation = transform_vector(transform.get("translation", [0, 0, 0]), 0.0)

        for obj in matched:
            relative = obj.location - pivot
            obj.location = pivot + Vector((relative.x * scale.x, relative.y * scale.y, relative.z * scale.z)) + translation
            obj.scale.x *= scale.x
            obj.scale.y *= scale.y
            obj.scale.z *= scale.z


def add_generated_band(objects, model_settings, pivot=None):
    config = model_settings.get("generated_band") or {}
    if not config.get("enabled", False):
        return []

    segments = max(24, int(config.get("segments", 128)))
    tube_segments = max(8, int(config.get("tube_segments", 18)))
    radius_x = float(config.get("radius_x", 0.86))
    radius_z = float(config.get("radius_z", 0.48))
    tube_radius = float(config.get("tube_radius", 0.055))
    tube_y_scale = float(config.get("tube_y_scale", 1.0))
    center = Vector(transform_vector(config.get("center", [0, 0, 0]), 0.0))

    vertices = []
    faces = []
    for i in range(segments):
        theta = 2.0 * math.pi * i / segments
        ring_center = center + Vector((radius_x * math.cos(theta), 0.0, radius_z * math.sin(theta)))
        normal = Vector((radius_z * math.cos(theta), 0.0, radius_x * math.sin(theta)))
        if normal.length < 0.00001:
            normal = Vector((1.0, 0.0, 0.0))
        else:
            normal.normalize()
        binormal = Vector((0.0, 1.0, 0.0))
        for j in range(tube_segments):
            phi = 2.0 * math.pi * j / tube_segments
            point = ring_center + normal * (math.cos(phi) * tube_radius) + binormal * (math.sin(phi) * tube_radius * tube_y_scale)
            vertices.append(tuple(point))

    for i in range(segments):
        next_i = (i + 1) % segments
        for j in range(tube_segments):
            next_j = (j + 1) % tube_segments
            faces.append(
                (
                    i * tube_segments + j,
                    next_i * tube_segments + j,
                    next_i * tube_segments + next_j,
                    i * tube_segments + next_j,
                )
            )

    mesh = bpy.data.meshes.new(config.get("mesh_name", "generated_plain_band_mesh"))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    band = bpy.data.objects.new(config.get("name", "generated_metal_band_shank"), mesh)
    bpy.context.collection.objects.link(band)
    band.select_set(True)
    bpy.context.view_layer.objects.active = band
    bpy.ops.object.shade_smooth()
    band.select_set(False)
    if pivot is not None:
        # The band is built in normalized world space AFTER normalize() ran, so
        # the pivot is no longer identity. Keep-transform parent it (parent
        # inverse cancels the current pivot matrix exactly) so the band follows
        # the pivot-level transform_model writes (rotation/translation/
        # ground_to_plane) exactly like the imported meshes — previously it
        # rode the per-object loops.
        band.parent = pivot
        band.matrix_parent_inverse = pivot.matrix_world.inverted()
        bpy.context.view_layer.update()
    objects.append(band)
    return [band]


def object_bounds(objects):
    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
    return mins, maxs


def bounds_summary(objects):
    mins, maxs = object_bounds(objects)
    size = maxs - mins
    return {
        "min": list(mins),
        "max": list(maxs),
        "size": list(size),
        "center": list((mins + maxs) * 0.5),
        "max_dimension": max(size.x, size.y, size.z),
    }


def transform_model(objects, model_settings, background_settings, pivot=None):
    """Whole-product recipe transforms: rotation_degrees, translation,
    ground_to_plane. All three act on the ENTIRE product, so in the
    single-pivot architecture each is one world-space matrix composed onto the
    pivot — including ground_to_plane's lift, which becomes a world-space
    [0, 0, dz] translation matrix instead of per-object location math.
    pivot=None falls back to the legacy per-object writes."""
    rotation = model_settings.get("rotation_degrees", [0, 0, 0])
    if any(abs(float(value)) > 0.0001 for value in rotation):
        matrix = Euler([math.radians(float(value)) for value in rotation], "XYZ").to_matrix().to_4x4()
        if pivot is not None:
            pivot.matrix_world = matrix @ pivot.matrix_world
            bpy.context.view_layer.update()
        else:
            for obj in objects:
                obj.matrix_world = matrix @ obj.matrix_world

    translation = model_settings.get("translation", [0, 0, 0])
    if any(abs(float(value)) > 0.0001 for value in translation):
        offset = Vector((float(translation[0]), float(translation[1]), float(translation[2])))
        if pivot is not None:
            pivot.matrix_world = Matrix.Translation(offset) @ pivot.matrix_world
            bpy.context.view_layer.update()
        else:
            for obj in objects:
                obj.location += offset

    if model_settings.get("ground_to_plane", True):
        mins, _ = object_bounds(objects)
        plane_z = float(background_settings.get("plane_z", -0.04))
        clearance = float(model_settings.get("ground_clearance", 0.015))
        lift = plane_z + clearance - mins.z
        if pivot is not None:
            pivot.matrix_world = Matrix.Translation(Vector((0.0, 0.0, lift))) @ pivot.matrix_world
            bpy.context.view_layer.update()
        else:
            for obj in objects:
                obj.location.z += lift


def apply_pass_visibility(objects, model_settings):
    """Layered-pass visibility, applied AFTER transform_model.

    The normalization basis stays the FULL product — every pass shares the same
    auto_center/auto_scale/ground_to_plane transform, so metal/stone layers
    align for compositing. Only then are non-target objects hidden or held out:

    - pass_hide_contains: matching objects get hide_render = True. Used by the
      METAL pass to fully hide stones, so metal renders complete behind where
      the stones sit.
    - pass_holdout_contains: matching objects stay renderable as holdouts —
      they punch alpha (correct occlusion silhouettes for compositing) without
      contributing color. Secondary ray visibility is disabled so the holdout
      metal does not refract dark into the stones.

    When neither field is present this is a no-op (old recipes unaffected).
    """
    hide_tokens = [token.lower() for token in model_settings.get("pass_hide_contains", [])]
    holdout_tokens = [token.lower() for token in model_settings.get("pass_holdout_contains", [])]
    if not hide_tokens and not holdout_tokens:
        return

    holdout_ray_visibility = [
        "visible_shadow",
        "visible_diffuse",
        "visible_glossy",
        "visible_transmission",
        "visible_volume_scatter",
    ]
    for obj in objects:
        signature = object_signature(obj)
        if hide_tokens and any(token in signature for token in hide_tokens):
            obj.hide_render = True
            continue
        if holdout_tokens and any(token in signature for token in holdout_tokens):
            obj.hide_render = False
            obj.is_holdout = True
            for attribute in holdout_ray_visibility:
                if hasattr(obj, attribute):
                    setattr(obj, attribute, False)


def make_material(name, preset):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    if preset.get("type") == "catalog_diamond":
        return make_catalog_diamond_material(material, preset)

    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return material

    inputs = bsdf.inputs
    values = {
        "Base Color": preset.get("base_color"),
        "Metallic": preset.get("metallic"),
        "Roughness": preset.get("roughness"),
        "Alpha": preset.get("alpha"),
        "IOR": preset.get("ior"),
        "Transmission Weight": preset.get("transmission_weight"),
        "Specular IOR Level": preset.get("specular_ior_level"),
    }
    for input_name, value in values.items():
        if value is not None and input_name in inputs:
            inputs[input_name].default_value = value
    material.blend_method = "BLEND" if preset.get("alpha", 1.0) < 1 else "OPAQUE"
    material.use_screen_refraction = preset.get("type") == "gem"
    return material


def set_node_input(node, input_name, value):
    if input_name in node.inputs and value is not None:
        node.inputs[input_name].default_value = value


def make_catalog_diamond_material(material, preset):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)

    glass = nodes.new("ShaderNodeBsdfGlass")
    glass.location = (-420, 120)
    set_node_input(glass, "Color", preset.get("glass_color", [1.0, 0.985, 0.955, 1.0]))
    set_node_input(glass, "Roughness", preset.get("roughness", 0.0))
    set_node_input(glass, "IOR", preset.get("ior", 2.417))

    glossy = nodes.new("ShaderNodeBsdfGlossy")
    glossy.location = (-420, -80)
    set_node_input(glossy, "Color", preset.get("gloss_color", [1.0, 1.0, 1.0, 1.0]))
    set_node_input(glossy, "Roughness", preset.get("gloss_roughness", 0.015))

    add = nodes.new("ShaderNodeAddShader")
    add.location = (-120, 80)
    links.new(glass.outputs["BSDF"], add.inputs[0])
    links.new(glossy.outputs["BSDF"], add.inputs[1])

    transparent_mix = float(preset.get("transparent_mix", 0.06))
    if transparent_mix > 0:
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        transparent.location = (-120, -160)
        set_node_input(transparent, "Color", preset.get("transparent_color", [1.0, 1.0, 1.0, 1.0]))

        mix = nodes.new("ShaderNodeMixShader")
        mix.location = (180, 0)
        mix.inputs["Fac"].default_value = max(0.0, min(1.0, transparent_mix))
        links.new(add.outputs["Shader"], mix.inputs[1])
        links.new(transparent.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], output.inputs["Surface"])
    else:
        links.new(add.outputs["Shader"], output.inputs["Surface"])

    material.blend_method = "BLEND"
    material.use_screen_refraction = True
    material.show_transparent_back = True
    return material


def mix_color(current, target, amount):
    amount = max(0.0, min(1.0, float(amount)))
    return [current[i] * (1.0 - amount) + target[i] * amount for i in range(min(len(current), len(target)))]


def socket_default(socket):
    value = getattr(socket, "default_value", None)
    if value is None:
        return None
    if hasattr(value, "__iter__") and not isinstance(value, str):
        return list(value)
    return value


def set_socket_default(socket, value):
    if value is not None and hasattr(socket, "default_value"):
        socket.default_value = value


def adjust_color_socket(node, input_name, target, amount):
    if input_name not in node.inputs:
        return
    current = socket_default(node.inputs[input_name])
    if not isinstance(current, list):
        return
    if len(target) == 3 and len(current) >= 4:
        target = [target[0], target[1], target[2], current[3]]
    set_socket_default(node.inputs[input_name], mix_color(current, target, amount))


def multiply_socket(node, input_name, scale, minimum=None, maximum=None):
    if input_name not in node.inputs or scale is None:
        return
    current = socket_default(node.inputs[input_name])
    if not isinstance(current, (int, float)):
        return
    value = current * float(scale)
    if minimum is not None:
        value = max(float(minimum), value)
    if maximum is not None:
        value = min(float(maximum), value)
    set_socket_default(node.inputs[input_name], value)


def adjust_source_material(material, adjust):
    if not adjust or not material or not material.use_nodes or not material.node_tree:
        return material

    material = material.copy()
    material.name = f"{material.name}_adjusted"
    glass_target = adjust.get("glass_color")
    glass_color_mix = adjust.get("glass_color_mix", 0)
    volume_target = adjust.get("volume_color")
    volume_color_mix = adjust.get("volume_color_mix", 0)
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBsdfGlass":
            if glass_target is not None:
                adjust_color_socket(node, "Color", glass_target, glass_color_mix)
            if "Roughness" in node.inputs and "glass_roughness" in adjust:
                set_socket_default(node.inputs["Roughness"], float(adjust["glass_roughness"]))
            if "IOR" in node.inputs and "ior" in adjust:
                set_socket_default(node.inputs["IOR"], float(adjust["ior"]))
        elif node.bl_idname == "ShaderNodeBsdfPrincipled":
            base_color = adjust.get("base_color")
            if base_color is not None:
                adjust_color_socket(node, "Base Color", base_color, adjust.get("base_color_mix", 1.0))
            if "Metallic" in node.inputs and "metallic" in adjust:
                set_socket_default(node.inputs["Metallic"], float(adjust["metallic"]))
            if "Roughness" in node.inputs and "roughness" in adjust:
                set_socket_default(node.inputs["Roughness"], float(adjust["roughness"]))
            if "Alpha" in node.inputs and "alpha" in adjust:
                set_socket_default(node.inputs["Alpha"], float(adjust["alpha"]))
            if "Specular IOR Level" in node.inputs and "specular_ior_level" in adjust:
                set_socket_default(node.inputs["Specular IOR Level"], float(adjust["specular_ior_level"]))
            if "IOR" in node.inputs and "ior" in adjust:
                set_socket_default(node.inputs["IOR"], float(adjust["ior"]))
        elif node.bl_idname in {"ShaderNodeVolumeAbsorption", "ShaderNodeVolumeScatter"}:
            if volume_target is not None:
                adjust_color_socket(node, "Color", volume_target, volume_color_mix)
            multiply_socket(node, "Density", adjust.get("volume_density_scale"), 0.0, adjust.get("volume_density_max"))
        elif node.bl_idname == "ShaderNodeEmission":
            if "emission_color" in adjust:
                adjust_color_socket(node, "Color", adjust["emission_color"], adjust.get("emission_color_mix", 1.0))
            multiply_socket(node, "Strength", adjust.get("emission_strength_scale"), 0.0, adjust.get("emission_strength_max"))
        elif node.bl_idname == "ShaderNodeValue":
            if node.outputs:
                current = socket_default(node.outputs[0])
                if isinstance(current, (int, float)):
                    value = current * float(adjust.get("value_scale", 1.0)) + float(adjust.get("value_offset", 0.0))
                    if "value_min" in adjust:
                        value = max(float(adjust["value_min"]), value)
                    if "value_max" in adjust:
                        value = min(float(adjust["value_max"]), value)
                    node.outputs[0].default_value = value
        elif node.bl_idname == "ShaderNodeHueSaturation":
            multiply_socket(node, "Saturation", adjust.get("saturation_scale"), 0.0, adjust.get("saturation_max"))
            multiply_socket(node, "Value", adjust.get("hsv_value_scale"), 0.0, adjust.get("hsv_value_max"))

    material.diffuse_color = adjust.get("diffuse_color", material.diffuse_color)
    if "blend_method" in adjust:
        material.blend_method = adjust["blend_method"]
    if "use_screen_refraction" in adjust:
        material.use_screen_refraction = bool(adjust["use_screen_refraction"])
    return material


def object_signature(obj):
    material_names = " ".join(slot.material.name for slot in obj.material_slots if slot.material)
    return f"{obj.name} {material_names}".lower()


def assign_materials(objects, recipe):
    strategy = recipe.get("material_strategy", "override")
    if strategy == "source":
        return

    presets = {name: make_material(f"render_{name}", preset) for name, preset in recipe["materials"].items()}
    for obj in objects:
        signature = object_signature(obj)
        selected = None
        for rule in recipe.get("material_map", []):
            if any(token.lower() in signature for token in rule["contains"]):
                source_material = rule.get("source_material")
                if source_material:
                    selected = bpy.data.materials.get(source_material)
                    selected = adjust_source_material(selected, rule.get("source_material_adjust"))
                else:
                    selected = presets[rule["material"]]
                break
        if selected is None:
            if strategy == "hybrid":
                continue
            selected = presets["white_gold_polished"]
        obj.data.materials.clear()
        obj.data.materials.append(selected)


def setup_render(recipe):
    render = recipe["render"]
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = render["samples"]
    scene.cycles.use_denoising = render.get("denoise", True)
    scene.cycles.max_bounces = 16
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.transmission_bounces = 16
    scene.render.resolution_x = render["resolution"][0]
    scene.render.resolution_y = render["resolution"][1]
    scene.render.film_transparent = render.get("transparent", False)
    scene.view_settings.view_transform = render.get("view_transform", "Filmic")
    scene.view_settings.look = render.get("look", "Medium High Contrast")
    scene.view_settings.exposure = render.get("exposure", 0)
    scene.view_settings.gamma = render.get("gamma", 1)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def setup_world(recipe):
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    hdri_url = recipe["world"].get("hdri_url")
    if hdri_url:
        nodes = world.node_tree.nodes
        links = world.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputWorld")
        output.location = (520, 0)
        background = nodes.new("ShaderNodeBackground")
        background.location = (260, 0)
        env = nodes.new("ShaderNodeTexEnvironment")
        env.location = (-120, 0)
        hdri_path = Path(tempfile.gettempdir()) / Path(str(hdri_url).split("?")[0]).name
        if not hdri_path.exists():
            urllib.request.urlretrieve(hdri_url, hdri_path)
        env.image = bpy.data.images.load(str(hdri_path), check_existing=True)
        background.inputs["Strength"].default_value = recipe["world"].get("hdri_strength", recipe["world"].get("strength", 0.18))
        links.new(env.outputs["Color"], background.inputs["Color"])
        links.new(background.outputs["Background"], output.inputs["Surface"])
        return
    bg = world.node_tree.nodes.get("Background")
    if bg:
        color = recipe["world"].get("color", [1, 1, 1])
        bg.inputs["Color"].default_value = [color[0], color[1], color[2], 1]
        bg.inputs["Strength"].default_value = recipe["world"].get("strength", 0.18)


def dump_transform_debug(objects):
    """Per-object transform forensics (recipe.debug_transforms): compares the
    raw matrix_world against the depsgraph-EVALUATED world matrix — any
    difference is exactly the set-vs-rendered divergence we are hunting —
    and records delta transforms / parenting that could cause it."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rows = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        raw = [list(row) for row in obj.matrix_world]
        ev = [list(row) for row in evaluated.matrix_world]
        diverged = any(
            abs(raw[i][j] - ev[i][j]) > 1e-4 for i in range(4) for j in range(4)
        )
        rows.append({
            "name": obj.name,
            "parent": obj.parent.name if obj.parent else None,
            "diverged": diverged,
            "delta_location": list(obj.delta_location),
            "delta_rotation_euler": list(obj.delta_rotation_euler),
            "delta_scale": list(obj.delta_scale),
            "constraints": [c.type for c in obj.constraints],
            "modifiers": [m.type for m in obj.modifiers],
            "raw_world_translation": raw[0][3:4] + raw[1][3:4] + raw[2][3:4],
            "evaluated_world_translation": ev[0][3:4] + ev[1][3:4] + ev[2][3:4],
        })
    return rows


def make_floor_sweep_material(name, color, roughness, specular, camera_strength):
    """Catalog white-sweep floor: Light Path mix — camera rays get a pure white
    emission (exact uniform pixels, immune to grazing-angle shading/shadow
    contamination), all other rays get the matte diffuse floor so product
    lighting/bounce stays physical. The standard Blender product-viz cheat."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)

    mix = nodes.new("ShaderNodeMixShader")
    mix.location = (300, 0)

    light_path = nodes.new("ShaderNodeLightPath")
    light_path.location = (0, 240)

    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (0, -60)
    principled.inputs["Base Color"].default_value = [color[0], color[1], color[2], 1.0]
    principled.inputs["Roughness"].default_value = float(roughness)
    if "Specular IOR Level" in principled.inputs:
        principled.inputs["Specular IOR Level"].default_value = float(specular)

    emission = nodes.new("ShaderNodeEmission")
    emission.location = (0, -280)
    emission.inputs["Color"].default_value = [1.0, 1.0, 1.0, 1.0]
    emission.inputs["Strength"].default_value = float(camera_strength)

    # Fac = Is Camera Ray: 0 -> physical floor (lighting), 1 -> white sweep (camera)
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(principled.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def make_backdrop_material(name, color, strength):
    # Pure EMISSION shader (explicit node tree, like make_catalog_diamond_material):
    # the backdrop must paint exact pixels — a Principled BSDF would shade with
    # scene lighting and pick up the same grey gradients we are eliminating.
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (260, 0)

    emission = nodes.new("ShaderNodeEmission")
    emission.location = (0, 0)
    emission.inputs["Color"].default_value = [color[0], color[1], color[2], 1.0]
    emission.inputs["Strength"].default_value = float(strength)
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def add_catalog_backdrop(bg):
    # Catalog sweep (live-render fix): auto_orient + auto_frame raised the camera
    # target, so cameras view the floor at a grazing angle — the ENTIRE frame
    # background became floor, showing the product's soft-shadow wedge and the
    # area-light pools. A real catalog studio has a vertical backdrop behind the
    # product; this adds one. All enterprise cameras look from -Y toward +Y, so a
    # big plane perpendicular to +Y behind the product covers every preset.
    backdrop = bg.get("backdrop") or {}
    if not backdrop.get("enabled"):
        return  # absent/disabled = byte-identical legacy scene
    size = float(backdrop.get("size", 30.0))
    distance = float(backdrop.get("distance", 6.0))
    bpy.ops.mesh.primitive_plane_add(
        size=size,
        # Default plane lies in XY; rotate 90° about X to stand it vertical
        # (perpendicular to Y). Center z = size/4 spans the horizon line:
        # bottom at -size/4 (below floor), top at 3*size/4 (well above frame).
        location=(0.0, distance, size / 4.0),
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    sweep = bpy.context.object
    sweep.name = "catalog_backdrop"
    color = backdrop.get("color", [1.0, 1.0, 1.0])
    sweep.data.materials.append(
        make_backdrop_material("catalog_backdrop_emission", color, backdrop.get("strength", 25.0))
    )
    # Camera-only visibility: paints pure backdrop pixels but contributes ZERO
    # light to the scene — every indirect light-path contribution is disabled
    # (hasattr-guarded loop, same pattern as reflection cards). Stone passes
    # (background.visible_camera=false) ALSO hide the backdrop from camera so
    # the transparent stones-on-alpha layer stays clean.
    visibility_map = {
        "visible_camera": bool(bg.get("visible_camera", True)),
        "visible_diffuse": False,
        "visible_glossy": False,
        "visible_transmission": False,
        "visible_volume_scatter": False,
        "visible_shadow": False,
    }
    for attribute, value in visibility_map.items():
        if hasattr(sweep, attribute):
            setattr(sweep, attribute, value)


def setup_background(recipe):
    bg = recipe["background"]
    bpy.ops.mesh.primitive_plane_add(size=bg.get("plane_size", 8), location=(0, 0, bg.get("plane_z", -0.04)))
    plane = bpy.context.object
    plane.name = "catalog_shadow_plane"
    # Floor material — the classic catalog "white sweep" Light Path trick
    # (background.camera_white, default ON): CAMERA rays see a pure white
    # emission (exact pixels — the clean sweep the catalog look demands at ANY
    # camera elevation), while every other ray type sees the matte diffuse
    # floor, so the product still receives physically-correct floor bounce and
    # the studio stays unchanged for lighting. Contact-shadow discs are separate
    # geometry drawn over the floor, so grounding survives. This replaced the
    # plain matte floor, whose grazing-angle shading (soft shadow wedge +
    # area-light pools) contaminated the background once auto_frame raised the
    # camera target — and leaked into the studio_background postprocess's
    # protected product rectangles as grey blocks.
    if bg.get("camera_white", True):
        mat = make_floor_sweep_material(
            "catalog_warm_white",
            bg.get("color", [0.98, 0.98, 0.965, 1]),
            bg.get("roughness", 1.0),
            bg.get("specular", 0.02),
            bg.get("camera_white_strength", 25.0),
        )
    else:
        mat = make_material("catalog_warm_white", {
            "base_color": bg.get("color", [0.98, 0.98, 0.965, 1]),
            "roughness": bg.get("roughness", 1.0),
            "specular_ior_level": bg.get("specular", 0.02),
        })
    plane.data.materials.append(mat)
    # background.visible_camera=false (stone passes): the floor must keep
    # LIGHTING the product — diffuse/glossy/transmission bounce preserved — but
    # camera rays pass through it, so the transparent holdout layer ships as
    # pure stones-on-alpha for compositing. Legacy lesson: never delete the
    # floor for stone shots, hide it from camera only.
    if not bg.get("visible_camera", True) and hasattr(plane, "visible_camera"):
        plane.visible_camera = False
    add_catalog_backdrop(bg)


def add_contact_shadows(recipe):
    # Stone passes hide the floor from camera (background.visible_camera=false);
    # the fake contact-shadow discs sit on that floor and must vanish with it,
    # or they render as opaque pixels on the stones-on-alpha layer. They keep
    # diffuse visibility only — negligible, and consistent with the floor fix.
    camera_visible = bool(recipe.get("background", {}).get("visible_camera", True))
    for config in recipe.get("contact_shadows", []):
        layers = max(1, int(config.get("layers", 3)))
        base_alpha = float(config.get("alpha", 0.18))
        position = config.get("position", [0, 0, recipe["background"].get("plane_z", -0.04) + 0.002])
        size = config.get("size", [2.0, 0.55])
        color = config.get("color", [0.0, 0.0, 0.0])
        vertices_count = max(32, int(config.get("vertices", 96)))

        for layer in range(layers):
            scale_factor = 1.0 + (layer / max(1, layers - 1)) * float(config.get("spread", 0.55))
            alpha = base_alpha * (1.0 - layer / (layers + 0.5))
            z_offset = 0.001 + layer * 0.0005
            bpy.ops.mesh.primitive_circle_add(
                vertices=vertices_count,
                radius=1.0,
                fill_type="TRIFAN",
                location=(float(position[0]), float(position[1]), float(position[2]) + z_offset),
                rotation=(0, 0, math.radians(float(config.get("rotation_degrees", 0)))),
            )
            shadow = bpy.context.object
            shadow.name = f"{config.get('name', 'soft_contact_shadow')}_{layer + 1}"
            shadow.scale = (float(size[0]) * scale_factor, float(size[1]) * scale_factor, 1)
            mat = make_material(
                shadow.name + "_material",
                {
                    "base_color": [color[0], color[1], color[2], alpha],
                    "alpha": alpha,
                    "roughness": 0.85,
                },
            )
            shadow.data.materials.append(mat)
            shadow.visible_shadow = False
            shadow.visible_glossy = False
            shadow.visible_transmission = False
            if not camera_visible and hasattr(shadow, "visible_camera"):
                shadow.visible_camera = False


def add_reflection_cards_from_configs(configs):
    for config in configs:
        bpy.ops.mesh.primitive_plane_add(
            size=1.0,
            location=config["position"],
            rotation=[math.radians(v) for v in config.get("rotation_degrees", [0, 0, 0])],
        )
        card = bpy.context.object
        card.name = config["name"]
        size = config.get("size", [1, 1])
        card.scale = (size[0], size[1], 1)
        mat = make_material(config["name"] + "_material", {"base_color": config.get("color", [0.1, 0.1, 0.1, 1]), "roughness": 0.5})
        card.data.materials.append(mat)
        card.visible_camera = config.get("visible_to_camera", False)
        visibility_map = {
            "visible_shadow": config.get("visible_to_shadow", True),
            "visible_diffuse": config.get("visible_to_diffuse", True),
            "visible_glossy": config.get("visible_to_glossy", True),
            "visible_transmission": config.get("visible_to_transmission", True),
            "visible_volume_scatter": config.get("visible_to_volume_scatter", True),
        }
        for attribute, value in visibility_map.items():
            if hasattr(card, attribute):
                setattr(card, attribute, bool(value))


def add_reflection_cards(recipe):
    add_reflection_cards_from_configs(recipe.get("reflection_cards", []))


def add_lights(recipe):
    for config in recipe.get("lights", []):
        data = bpy.data.lights.new(config["name"], config["type"])
        obj = bpy.data.objects.new(config["name"], data)
        bpy.context.collection.objects.link(obj)
        obj.location = config["position"]
        obj.rotation_euler = [math.radians(v) for v in config.get("rotation_degrees", [0, 0, 0])]
        data.energy = config.get("power", 100)
        if "color" in config:
            color = config["color"]
            data.color = (color[0], color[1], color[2])
        if config["type"] == "AREA":
            data.shape = "RECTANGLE"
            data.size = config.get("size", 1)
            data.size_y = config.get("size_y", config.get("size", 1))
        if config["type"] == "POINT":
            data.shadow_soft_size = config.get("shadow_soft_size", 0.02)


def make_overlay_material(name, color, alpha):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = [color[0], color[1], color[2], alpha]
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.18
    material.blend_method = "BLEND"
    material.show_transparent_back = False
    return material


def add_center_facet_overlay(objects, recipe):
    config = recipe.get("facet_overlay", {})
    if not config.get("enabled", False):
        return []

    tokens = [token.lower() for token in config.get("object_contains", ["Round_5"])]
    target = None
    for obj in objects:
        if any(token in object_signature(obj) for token in tokens):
            target = obj
            break
    if target is None or bpy.context.scene.camera is None:
        return []

    mins, maxs = object_bounds([target])
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * float(config.get("radius_scale", 0.48))

    camera = bpy.context.scene.camera
    toward_camera = (camera.location - center).normalized()
    right = camera.matrix_world.to_quaternion() @ Vector((1, 0, 0))
    up = camera.matrix_world.to_quaternion() @ Vector((0, 1, 0))
    plane_center = center + toward_camera * float(config.get("camera_offset", 0.012))

    white = make_overlay_material("facet_overlay_white", [1.0, 1.0, 1.0], float(config.get("light_alpha", 0.2)))
    dark = make_overlay_material("facet_overlay_dark", [0.04, 0.045, 0.055], float(config.get("dark_alpha", 0.12)))
    blue = make_overlay_material("facet_overlay_blue", [0.34, 0.72, 1.0], float(config.get("chroma_alpha", 0.1)))
    amber = make_overlay_material("facet_overlay_amber", [1.0, 0.78, 0.22], float(config.get("chroma_alpha", 0.1)))
    materials = [white, dark, blue, white, amber, dark]

    created = []
    count = int(config.get("facets", 20))
    y_scale = float(config.get("y_scale", 0.82))
    inner_ratio = float(config.get("inner_ratio", 0.18))
    for index in range(count):
        a0 = -math.pi / 2 + index * math.tau / count
        a1 = -math.pi / 2 + (index + 1) * math.tau / count
        mid = (a0 + a1) * 0.5
        inner = radius * (inner_ratio if index % 2 else inner_ratio * 1.45)
        p0 = plane_center + right * (math.cos(a0) * radius) + up * (math.sin(a0) * radius * y_scale)
        p1 = plane_center + right * (math.cos(a1) * radius) + up * (math.sin(a1) * radius * y_scale)
        pc = plane_center + right * (math.cos(mid) * inner) + up * (math.sin(mid) * inner * y_scale)
        mesh = bpy.data.meshes.new(f"facet_overlay_mesh_{index:02d}")
        mesh.from_pydata([pc, p0, p1], [], [(0, 1, 2)])
        mesh.update()
        obj = bpy.data.objects.new(f"facet_overlay_{index:02d}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(materials[index % len(materials)])
        obj.visible_shadow = False
        obj.visible_diffuse = False
        obj.visible_glossy = False
        created.append(obj)

    return created


def auto_frame_camera(camera_settings, objects):
    """Deterministic distance-fit framing of the normalized product (camera.auto_frame).

    Auto-orient now stands uploaded models upright, but the hand-tuned camera
    presets were tuned on a low/flat pose — on an upright ring they frame the
    band's bottom arc and crop the head (stones) above the frame. Retuning the
    presets per product shape is fragile; instead the camera frames the product
    bbox deterministically:

    - bbox = ALL kept product objects — NOT filtered by pass visibility
      (object_bounds ignores hide_render/is_holdout), so every layered pass
      frames identically and metal/stone layers stay aligned for compositing.
    - target = bbox center (+ optional camera.target_offset additive tweak).
    - The preset's LOOK DIRECTION is preserved: only the distance along
      normalize(configured_target - configured_position) is recomputed.
    - distance fits the max bbox dimension into the FOV: with focal length f
      (mm) on Blender's default 36mm sensor (sensor_fit AUTO; renders here are
      square so vertical FOV == horizontal), half_fov = atan(18 / f) and
      distance = (max_dimension / 2) * margin / tan(half_fov), with
      margin = camera.frame_margin (default 1.18, recipe-tunable).

    Returns (position, target, distance) for the camera transform + DOF focus.
    """
    mins, maxs = object_bounds(objects)
    target = (mins + maxs) * 0.5
    offset = camera_settings.get("target_offset", [0.0, 0.0, 0.0])
    target = target + Vector((float(offset[0]), float(offset[1]), float(offset[2])))

    direction = Vector(camera_settings["target"]) - Vector(camera_settings["position"])
    if direction.length < 1e-9:
        direction = Vector((0.0, 1.0, 0.0))
    direction = direction.normalized()

    size = maxs - mins
    max_dimension = max(size.x, size.y, size.z)
    focal_length = float(camera_settings.get("focal_length", 90))
    half_fov = math.atan(18.0 / focal_length)
    margin = float(camera_settings.get("frame_margin", 1.18))
    distance = (max_dimension / 2.0) * margin / math.tan(half_fov)
    position = target - direction * distance
    print(
        f"AUTO_FRAME: target=({target.x:.4f}, {target.y:.4f}, {target.z:.4f}) "
        f"distance={distance:.4f} fov={math.degrees(half_fov * 2.0):.2f}deg"
    )
    return position, target, distance


def setup_camera(recipe, objects=None):
    cam_data = bpy.data.cameras.new("catalog_camera")
    cam = bpy.data.objects.new("catalog_camera", cam_data)
    bpy.context.collection.objects.link(cam)
    camera = recipe["camera"]
    position = Vector(camera["position"])
    target = Vector(camera["target"])
    focus_distance = (target - position).length
    # camera.auto_frame (default False = byte-identical behavior): reframe on
    # the product bbox. Requires the kept product objects; the source-scene
    # path calls setup_camera without objects and keeps its preset verbatim.
    if camera.get("auto_frame", False) and objects:
        position, target, focus_distance = auto_frame_camera(camera, objects)
    cam.location = position
    direction = target - position
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = camera.get("focal_length", 90)
    cam_data.shift_x = float(camera.get("shift_x", 0.0))
    cam_data.shift_y = float(camera.get("shift_y", 0.0))
    dof = camera.get("depth_of_field", {})
    cam_data.dof.use_dof = dof.get("enabled", False)
    # An explicit depth_of_field.focus_distance still wins; otherwise focus on
    # the (possibly auto-framed) target — the product center.
    cam_data.dof.focus_distance = dof.get("focus_distance", focus_distance)
    cam_data.dof.aperture_fstop = dof.get("f_stop", 7.5)
    bpy.context.scene.camera = cam


def object_image_bounds(objects):
    scene = bpy.context.scene
    camera = scene.camera
    width = scene.render.resolution_x
    height = scene.render.resolution_y
    bounds = []
    for obj in objects:
        # Only actually-visible objects report bounds: pass-hidden objects do
        # not render at all, and holdout objects only punch alpha.
        if obj.hide_render or getattr(obj, "is_holdout", False):
            continue
        # Frustum-validity gate (live-render fix): world_to_camera_view returns
        # MEANINGLESS x/y for points BEHIND the camera plane — min/maxing those
        # garbage values produced a clamped rectangle pinned at a frame edge
        # (a ring-mounted diamond reported bounds_norm centered at ~(0.97,
        # 0.44)), which made diamond_facets paint its synthetic star at the
        # right edge ("detached diamond") and replace_studio_background protect
        # the wrong region. Project all 8 bounding-box corners; EVERY corner
        # must be in front of the camera (view depth z > 0) or the object is
        # OMITTED. The bbox is the convex hull of the mesh, so 8 valid corners
        # guarantee every sampled vertex projects meaningfully. Conservative by
        # design: partial frustum visibility = no entry — we only emit RELIABLE
        # rectangles. Both postprocess consumers handle a missing entry safely
        # (diamond_facets fallback "skip" skips the stage; studio_background
        # falls back to its luminance mask).
        corner_depths = [
            world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner)).z
            for corner in obj.bound_box
        ]
        if len(corner_depths) < 8 or any(depth <= 0.0 for depth in corner_depths):
            continue
        projected = []
        mesh = obj.data
        vertices = getattr(mesh, "vertices", [])
        stride = max(1, math.ceil(len(vertices) / 4000)) if vertices else 1
        for index, vertex in enumerate(vertices):
            if index % stride:
                continue
            co = world_to_camera_view(scene, camera, obj.matrix_world @ vertex.co)
            projected.append((co.x, co.y))
        if not projected:
            continue
        x_values = [point[0] for point in projected]
        y_values = [point[1] for point in projected]
        raw_x0 = min(x_values)
        raw_x1 = max(x_values)
        raw_y0 = min(y_values)
        raw_y1 = max(y_values)
        if raw_x1 < 0.0 or raw_x0 > 1.0 or raw_y1 < 0.0 or raw_y0 > 1.0:
            continue
        x0 = max(0.0, raw_x0)
        x1 = min(1.0, raw_x1)
        y0 = max(0.0, raw_y0)
        y1 = min(1.0, raw_y1)
        if x1 <= x0 or y1 <= y0:
            continue
        # Degenerate full-frame guard: a near-frame-filling rectangle carries
        # no targeting information (and usually means the projection was not
        # trustworthy) — omit it rather than hand consumers an unreliable box.
        if (x1 - x0) > 0.98 or (y1 - y0) > 0.98:
            continue
        material_names = [slot.material.name for slot in obj.material_slots if slot.material]
        bounds.append(
            {
                "name": obj.name,
                "materials": material_names,
                "signature": f"{obj.name} {' '.join(material_names)}",
                "bounds_norm": [x0, 1.0 - y1, x1, 1.0 - y0],
                "bounds_px": [round(x0 * width), round((1.0 - y1) * height), round(x1 * width), round((1.0 - y0) * height)],
            }
        )
    return bounds


def main():
    print(f"WORKER_BUILD: {WORKER_BUILD}")
    parsed = args()
    recipe = deep_merge(DEFAULT_RECIPE, json.loads(Path(parsed.recipe).read_text(encoding="utf-8")))
    if recipe.get("master_scene", {}).get("enabled", False):
        if not parsed.master:
            raise RuntimeError(
                "master_scene.enabled recipe requires --master (handler input.master_scene was not provided)."
            )
        objects, master_meta = setup_master_scene(Path(parsed.master), Path(parsed.model), recipe)
        image_bounds = object_image_bounds(objects)
        bpy.context.scene.render.filepath = parsed.output
        bpy.ops.render.render(write_still=True)
        Path(parsed.metadata).write_text(
            json.dumps(
                {
                    "worker_build": WORKER_BUILD,
                    "recipe": recipe,
                    "master_scene": True,
                    "scene": bpy.context.scene.name,
                    "camera": bpy.context.scene.camera.name if bpy.context.scene.camera else None,
                    **master_meta,
                    "selected_objects": [obj.name for obj in objects],
                    "lights": [
                        obj.name
                        for obj in bpy.context.scene.objects
                        if obj.type == "LIGHT" and not obj.hide_render
                    ],
                    "world": bpy.context.scene.world.name if bpy.context.scene.world else None,
                    "object_image_bounds": image_bounds,
                    "materials": [material.name for material in bpy.data.materials],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return
    if recipe.get("source_scene", {}).get("enabled", False):
        objects = setup_source_scene(Path(parsed.model), recipe)
        if not objects:
            raise RuntimeError("Source scene contains no visible mesh objects for metadata.")
        image_bounds = object_image_bounds(objects)
        bpy.context.scene.render.filepath = parsed.output
        bpy.ops.render.render(write_still=True)
        Path(parsed.metadata).write_text(
            json.dumps(
                {
                    "worker_build": WORKER_BUILD,
                    "recipe": recipe,
                    "source_scene": True,
                    "scene": bpy.context.scene.name,
                    "camera": bpy.context.scene.camera.name if bpy.context.scene.camera else None,
                    "selected_objects": [obj.name for obj in objects],
                    "lights": [obj.name for obj in bpy.context.scene.objects if obj.type == "LIGHT" and not obj.hide_render],
                    "world": bpy.context.scene.world.name if bpy.context.scene.world else None,
                    "object_image_bounds": image_bounds,
                    "materials": [material.name for material in bpy.data.materials],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return

    clear_scene()
    setup_render(recipe)
    setup_world(recipe)
    objects = import_model(Path(parsed.model))
    # Single-pivot architecture: EVERY imported mesh (including ones the
    # include/exclude filter later hides) hangs off one identity pivot; all
    # whole-product transforms below write only pivot.matrix_world.
    pivot = create_product_pivot(objects)
    objects = filter_product_objects(objects, recipe["model"])
    if not objects:
        raise RuntimeError("No product mesh objects matched model include/exclude filters.")
    imported_bounds = bounds_summary(objects)
    normalize(objects, recipe["model"], pivot)
    normalized_bounds = bounds_summary(objects)
    apply_object_transforms(objects, recipe["model"])
    generated_objects = add_generated_band(objects, recipe["model"], pivot)
    object_transformed_bounds = bounds_summary(objects)
    transform_model(objects, recipe["model"], recipe["background"], pivot)
    transformed_bounds = bounds_summary(objects)
    apply_pass_visibility(objects, recipe["model"])
    assign_materials(objects, recipe)
    setup_background(recipe)
    add_contact_shadows(recipe)
    add_reflection_cards(recipe)
    add_lights(recipe)
    setup_camera(recipe, objects)
    overlay_objects = add_center_facet_overlay(objects, recipe)
    image_bounds = object_image_bounds(objects)
    bpy.context.scene.render.filepath = parsed.output
    bpy.ops.render.render(write_still=True)
    Path(parsed.metadata).write_text(
        json.dumps(
            {
                "worker_build": WORKER_BUILD,
                "recipe": recipe,
                "model_bounds": {
                    "imported": imported_bounds,
                    "normalized": normalized_bounds,
                    "object_transformed": object_transformed_bounds,
                    "transformed": transformed_bounds,
                },
                "selected_objects": [obj.name for obj in objects],
                "generated_objects": [obj.name for obj in generated_objects],
                "overlay_objects": [obj.name for obj in overlay_objects],
                "object_image_bounds": image_bounds,
                "materials": [material.name for material in bpy.data.materials],
                # debug_transforms (recipe flag): per-object transform forensics —
                # raw matrix_world vs the DEPSGRAPH-EVALUATED matrix, plus delta
                # transforms and parenting. Diagnoses set-vs-rendered divergence.
                **(
                    {"debug_transforms": dump_transform_debug(objects)}
                    if recipe.get("debug_transforms")
                    else {}
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
