from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
from pathlib import Path

import requests
from vercel.blob import BlobClient

from postprocess import apply_postprocess


WORKER_DIR = Path(__file__).resolve().parent
BLENDER_SCRIPT = WORKER_DIR / "render_scene.py"


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
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not configured.")
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


def run_blender(model_path: Path, recipe_path: Path, render_path: Path, metadata_path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
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
        ],
        text=True,
        capture_output=True,
        timeout=int(os.environ.get("BLENDER_TIMEOUT_SECONDS", "1800")),
    )


def env_recipe() -> dict:
    encoded = os.environ.get("RECIPE_JSON_B64")
    raw = base64.b64decode(encoded).decode("utf-8") if encoded else os.environ.get("RECIPE_JSON", "{}")
    return json.loads(raw)


def main() -> None:
    job_id = os.environ["RENDER_JOB_ID"]
    model_url = os.environ["MODEL_URL"]
    model_pathname = os.environ.get("MODEL_PATHNAME", "model.blend")
    output_prefix = os.environ.get("OUTPUT_PREFIX", f"outputs/pod-renders/{job_id}").rstrip("/")

    with tempfile.TemporaryDirectory() as temp_dir:
        work = Path(temp_dir)
        model_path = work / ("model" + Path(model_pathname).suffix)
        recipe_path = work / "recipe.json"
        render_path = work / "render.png"
        metadata_path = work / "metadata.json"

        print(json.dumps({"event": "download_model", "model_url": model_url}))
        download(model_url, model_path)
        recipe_path.write_text(json.dumps(env_recipe(), indent=2), encoding="utf-8")

        print(json.dumps({"event": "render_start", "job_id": job_id}))
        completed = run_blender(model_path, recipe_path, render_path, metadata_path)
        if completed.returncode != 0:
            failure = {
                "job_id": job_id,
                "error": "Blender render failed",
                "stdout": completed.stdout[-4000:],
                "stderr": completed.stderr[-4000:],
            }
            put_json_blob(failure, f"{output_prefix}/{job_id}_failure.json")
            print(json.dumps(failure, indent=2))
            raise SystemExit(1)

        print(json.dumps({"event": "upload_start", "job_id": job_id}))
        image_key = f"{output_prefix}/{job_id}.png"
        metadata_key = f"{output_prefix}/{job_id}.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
        metadata["postprocess"] = apply_postprocess(render_path, metadata, recipe)
        image_blob = upload_blob(render_path, image_key, "image/png")
        metadata_blob = put_json_blob(metadata, metadata_key)

    result = {
        "job_id": job_id,
        "image_key": image_key,
        "image_url": image_blob.get("url"),
        "image_blob": image_blob,
        "metadata_key": metadata_key,
        "metadata_blob": metadata_blob,
    }
    put_json_blob(result, f"{output_prefix}/{job_id}_result.json")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
