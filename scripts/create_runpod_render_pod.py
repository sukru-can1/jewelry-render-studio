from __future__ import annotations

import argparse
import base64
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


RUNPOD_REST = "https://rest.runpod.io/v1"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"'))


def request_json(method: str, path: str, api_key: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{RUNPOD_REST}{path}",
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"RunPod API error {exc.code}: {detail}") from exc


def download(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        output.write_bytes(response.read())


def public_blob_url(base_url: str, key: str) -> str:
    return f"{base_url.rstrip('/')}/{key.lstrip('/')}"


def args():
    parser = argparse.ArgumentParser(description="Create a one-shot RunPod Pod that renders one Blender recipe and exits.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--name", default="jewelry-render-once")
    parser.add_argument("--model-url", default="https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/ring99.blend")
    parser.add_argument("--model-pathname", default="models/ring99.blend")
    parser.add_argument("--output-prefix", default="")
    parser.add_argument("--download-to", default="")
    parser.add_argument("--timeout-seconds", type=int, default=2400)
    return parser.parse_args()


def main() -> None:
    parsed = args()
    load_env(Path(".env"))
    api_key = os.environ.get("RUNPOD_API_KEY")
    blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not api_key:
        raise SystemExit("RUNPOD_API_KEY is missing.")
    if not blob_token:
        raise SystemExit("BLOB_READ_WRITE_TOKEN is missing.")

    job_id = str(uuid.uuid4())
    recipe_json = Path(parsed.recipe).read_text(encoding="utf-8")
    output_prefix = parsed.output_prefix or f"outputs/ring99/pod_{job_id}"
    result_key = f"{output_prefix.rstrip('/')}/{job_id}_result.json"
    image_key = f"{output_prefix.rstrip('/')}/{job_id}.png"
    public_base_url = os.environ.get("BLOB_PUBLIC_BASE_URL", "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com")

    payload = {
        "name": f"{parsed.name}-{job_id[:8]}",
        "imageName": parsed.image,
        "computeType": "GPU",
        "cloudType": "SECURE",
        "gpuCount": 1,
        "gpuTypeIds": [
            "NVIDIA RTX A5000",
            "NVIDIA L4",
            "NVIDIA GeForce RTX 3090",
            "NVIDIA RTX A4000",
            "NVIDIA RTX A4500",
            "NVIDIA RTX 4000 Ada Generation",
            "NVIDIA A40",
            "NVIDIA RTX A6000",
            "NVIDIA L40",
            "NVIDIA L40S",
            "NVIDIA GeForce RTX 4090",
        ],
        "gpuTypePriority": "availability",
        "containerDiskInGb": 50,
        "volumeInGb": 0,
        "dockerEntrypoint": [],
        "dockerStartCmd": ["python3", "-u", "pod_render_once.py"],
        "env": {
            "BLOB_READ_WRITE_TOKEN": blob_token,
            "BLOB_ACCESS": os.environ.get("BLOB_ACCESS", "public"),
            "BLENDER_TIMEOUT_SECONDS": os.environ.get("BLENDER_TIMEOUT_SECONDS", "1800"),
            "RENDER_JOB_ID": job_id,
            "MODEL_URL": parsed.model_url,
            "MODEL_PATHNAME": parsed.model_pathname,
            "RECIPE_JSON_B64": base64.b64encode(recipe_json.encode("utf-8")).decode("ascii"),
            "OUTPUT_PREFIX": output_prefix,
        },
    }

    pod = request_json("POST", "/pods", api_key, payload)
    pod_id = pod["id"]
    print(json.dumps({"pod_id": pod_id, "job_id": job_id, "output_prefix": output_prefix}, indent=2))

    result_url = public_blob_url(public_base_url, result_key)
    image_url = public_blob_url(public_base_url, image_key)
    deadline = time.time() + parsed.timeout_seconds
    completed = False
    try:
        while time.time() < deadline:
            time.sleep(15)
            status = request_json("GET", f"/pods/{pod_id}?includeMachine=true", api_key)
            summary = {
                "desiredStatus": status.get("desiredStatus"),
                "lastStatusChange": status.get("lastStatusChange"),
                "gpu": (status.get("gpu") or {}).get("displayName") or (status.get("machine") or {}).get("gpuTypeId"),
            }
            print(json.dumps(summary))
            try:
                result = json.loads(urllib.request.urlopen(result_url, timeout=20).read().decode("utf-8"))
                print(json.dumps(result, indent=2))
                completed = True
                break
            except Exception:
                pass
        if not completed:
            raise SystemExit(f"Timed out waiting for pod render result: {result_url}")
        if parsed.download_to:
            download(image_url, Path(parsed.download_to))
    finally:
        try:
            terminated = request_json("DELETE", f"/pods/{pod_id}", api_key)
            print(json.dumps({"terminated": terminated.get("id", pod_id)}, indent=2))
        except Exception as exc:
            print(json.dumps({"terminate_error": str(exc), "pod_id": pod_id}, indent=2))


if __name__ == "__main__":
    main()
