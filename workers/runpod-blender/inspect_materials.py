from __future__ import annotations

import argparse
import json
from pathlib import Path

import bpy


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    import sys

    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


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
    return [obj for obj in bpy.data.objects if obj not in before]


def socket_value(socket):
    value = getattr(socket, "default_value", None)
    if value is None:
        return None
    if hasattr(value, "__iter__") and not isinstance(value, str):
        return list(value)
    return value


def material_summary(material):
    summary = {
        "name": material.name,
        "use_nodes": material.use_nodes,
        "diffuse_color": list(material.diffuse_color),
        "principled": {},
        "nodes": [],
    }
    if not material.use_nodes or not material.node_tree:
        return summary

    for node in material.node_tree.nodes:
        summary["nodes"].append({"name": node.name, "type": node.bl_idname})
        if node.name == "Principled BSDF" or node.bl_idname == "ShaderNodeBsdfPrincipled":
            for socket in node.inputs:
                value = socket_value(socket)
                if value is not None:
                    summary["principled"][socket.name] = value
    return summary


def object_summary(obj):
    return {
        "name": obj.name,
        "type": obj.type,
        "material_slots": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "children": [child.name for child in obj.children],
    }


def main():
    parsed = args()
    clear_scene()
    import_model(Path(parsed.model))
    inventory = {
        "source": str(parsed.model),
        "objects": [object_summary(obj) for obj in bpy.data.objects],
        "materials": [material_summary(material) for material in bpy.data.materials],
    }
    Path(parsed.output).write_text(json.dumps(inventory, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

