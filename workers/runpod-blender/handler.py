from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import requests
import runpod
from vercel.blob import BlobClient


WORKER_DIR = Path(__file__).resolve().parent
BLENDER_SCRIPT = WORKER_DIR / "render_scene.py"
INSPECT_SCRIPT = WORKER_DIR / "inspect_materials.py"
POSTPROCESS_SCRIPT = WORKER_DIR / "postprocess_image.py"


def download(url: str, destination: Path) -> None:
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def blob_client() -> BlobClient:
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not configured on the RunPod worker.")
    return BlobClient(token=token)


def blob_result_to_dict(blob) -> dict:
    if isinstance(blob, dict):
        return blob
    return {
        key: getattr(blob, key)
        for key in ("url", "download_url", "pathname", "content_type", "content_disposition", "etag")
        if hasattr(blob, key)
    }


def upload_blob(path: Path, key: str, content_type: str) -> dict:
    with path.open("rb") as handle:
        uploaded = blob_client().put(
            key,
            handle.read(),
            access=os.environ.get("BLOB_ACCESS", "public"),
            content_type=content_type,
            multipart=True,
        )
    return blob_result_to_dict(uploaded)


def put_json_blob(data: dict, key: str) -> dict:
    uploaded = blob_client().put(
        key,
        json.dumps(data, indent=2).encode("utf-8"),
        access=os.environ.get("BLOB_ACCESS", "public"),
        content_type="application/json",
    )
    return blob_result_to_dict(uploaded)


def run_blender(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        timeout=int(os.environ.get("BLENDER_TIMEOUT_SECONDS", "1800")),
    )


def handler(job):
    job_input = job["input"]
    operation = job_input.get("operation", "render")
    job_id = job_input["job_id"]
    model = job_input["model"]
    recipe = job_input.get("recipe", {})
    output = job_input.get("output", {})
    prefix = output.get("prefix") or f"renders/{job_id}"

    runpod.serverless.progress_update(job, "Downloading model")

    with tempfile.TemporaryDirectory() as temp_dir:
        work = Path(temp_dir)
        model_path = work / ("model" + Path(model["pathname"]).suffix)
        recipe_path = work / "recipe.json"
        render_path = work / "render.png"
        metadata_path = work / "metadata.json"

        download(model["url"], model_path)
        recipe_path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")

        if operation == "inspect_materials":
            runpod.serverless.progress_update(job, "Inspecting materials in Blender")
            inspect_path = work / "material_inventory.json"
            completed = run_blender(
                [
                    "blender",
                    "--background",
                    "--python",
                    str(INSPECT_SCRIPT),
                    "--",
                    "--model",
                    str(model_path),
                    "--output",
                    str(inspect_path),
                ]
            )
            if completed.returncode != 0:
                return {
                    "error": "Blender material inspection failed",
                    "stdout": completed.stdout[-4000:],
                    "stderr": completed.stderr[-4000:],
                }

            inventory_key = f"{prefix.rstrip('/')}/{job_id}_material_inventory.json"
            inventory = json.loads(inspect_path.read_text(encoding="utf-8"))
            uploaded = put_json_blob(inventory, inventory_key)
            return {
                "job_id": job_id,
                "inventory_key": inventory_key,
                "inventory_url": uploaded.get("url"),
                "inventory_blob": uploaded,
            }

        runpod.serverless.progress_update(job, "Rendering in Blender")
        completed = run_blender(
            [
                "blender",
                "--background",
                "--python",
                str(BLENDER_SCRIPT),
                "--",
                "--model",
                str(model_path),
                "--recipe",
                str(recipe_path),
                "--output",
                str(render_path),
                "--metadata",
                str(metadata_path),
            ]
        )
        if completed.returncode != 0:
            return {
                "error": "Blender render failed",
                "stdout": completed.stdout[-4000:],
                "stderr": completed.stderr[-4000:],
            }

        if recipe.get("postprocess", {}).get("enabled", False):
            runpod.serverless.progress_update(job, "Post-processing catalog image")
            completed = run_blender(
                [
                    "python",
                    str(POSTPROCESS_SCRIPT),
                    "--image",
                    str(render_path),
                    "--metadata",
                    str(metadata_path),
                    "--recipe",
                    str(recipe_path),
                ]
            )
            if completed.returncode != 0:
                return {
                    "error": "Image post-process failed",
                    "stdout": completed.stdout[-4000:],
                    "stderr": completed.stderr[-4000:],
                }

        runpod.serverless.progress_update(job, "Uploading output")
        image_key = f"{prefix.rstrip('/')}/{job_id}.png"
        metadata_key = f"{prefix.rstrip('/')}/{job_id}.json"
        image_blob = upload_blob(render_path, image_key, "image/png")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata_blob = put_json_blob(metadata, metadata_key)

    return {
        "job_id": job_id,
        "image_key": image_key,
        "image_url": image_blob.get("url"),
        "image_blob": image_blob,
        "metadata_key": metadata_key,
        "metadata_blob": metadata_blob,
    }


runpod.serverless.start({"handler": handler})
