from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path


RUNPOD_REST = "https://rest.runpod.io/v1"
ENDPOINT_ID = "4lvi3w848rqy0l"
IMAGE_NAME = "ghcr.io/sukru-can1/jewelry-render-worker:sha-fed328616e1f"
BLENDER_URL = "https://download.blender.org/release/Blender5.0/blender-5.0.1-linux-x64.tar.xz"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"'))


def request_json(method: str, path: str, payload: dict | None = None) -> dict:
    api_key = os.environ["RUNPOD_API_KEY"]
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{RUNPOD_REST}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"RunPod API error {exc.code}: {detail}") from exc


def b64(path: str) -> str:
    return base64.b64encode(Path(path).read_text(encoding="utf-8").encode("utf-8")).decode("ascii")


def main() -> None:
    load_env(Path(".env"))
    if not os.environ.get("RUNPOD_API_KEY"):
        raise SystemExit("RUNPOD_API_KEY is missing.")
    if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
        raise SystemExit("BLOB_READ_WRITE_TOKEN is missing.")

    start_cmd = (
        "set -euo pipefail; "
        "echo Installing Blender 5.0.1 runtime; "
        f"curl -L --retry 5 --retry-delay 3 '{BLENDER_URL}' -o /tmp/blender5.tar.xz; "
        "rm -rf /opt/blender5; mkdir -p /opt/blender5; "
        "tar -xf /tmp/blender5.tar.xz -C /opt/blender5 --strip-components=1; "
        "ln -sf /opt/blender5/blender /usr/local/bin/blender; "
        "blender --version | head -n 2; "
        "python3 -m pip install --no-cache-dir Pillow==10.4.0; "
        "python3 -c \"import base64, os, pathlib; "
        "pathlib.Path('handler.py').write_text(base64.b64decode(os.environ['INJECT_HANDLER_PY_B64']).decode('utf-8'), encoding='utf-8'); "
        "pathlib.Path('postprocess.py').write_text(base64.b64decode(os.environ['INJECT_POSTPROCESS_PY_B64']).decode('utf-8'), encoding='utf-8'); "
        "pathlib.Path('render_scene.py').write_text(base64.b64decode(os.environ['INJECT_RENDER_SCENE_PY_B64']).decode('utf-8'), encoding='utf-8'); "
        "pathlib.Path('inspect_materials.py').write_text(base64.b64decode(os.environ['INJECT_INSPECT_MATERIALS_PY_B64']).decode('utf-8'), encoding='utf-8')\"; "
        "python3 -u handler.py"
    )

    env = {
        "BLOB_READ_WRITE_TOKEN": os.environ["BLOB_READ_WRITE_TOKEN"],
        "BLOB_ACCESS": os.environ.get("BLOB_ACCESS", "public"),
        "BLENDER_TIMEOUT_SECONDS": os.environ.get("BLENDER_TIMEOUT_SECONDS", "1800"),
        "INJECT_HANDLER_PY_B64": b64("workers/runpod-blender/handler.py"),
        "INJECT_POSTPROCESS_PY_B64": b64("workers/runpod-blender/postprocess.py"),
        "INJECT_RENDER_SCENE_PY_B64": b64("workers/runpod-blender/render_scene.py"),
        "INJECT_INSPECT_MATERIALS_PY_B64": b64("workers/runpod-blender/inspect_materials.py"),
    }

    template_payload = {
        "name": f"jewelry-render-blender-v026-blender5-template-{int(time.time())}",
        "imageName": IMAGE_NAME,
        "category": "NVIDIA",
        "containerDiskInGb": 50,
        "dockerEntrypoint": [],
        "dockerStartCmd": ["bash", "-lc", start_cmd],
        "env": env,
        "isPublic": False,
        "isServerless": True,
        "ports": [],
        "readme": "Blender 5 runtime wrapper for Jewelry Render Studio.",
        "volumeInGb": 0,
        "volumeMountPath": "/workspace",
    }

    print("Creating Blender 5 RunPod template...")
    template = request_json("POST", "/templates", template_payload)
    template_id = template["id"]
    print(json.dumps({"templateId": template_id, "imageName": IMAGE_NAME}, indent=2))

    print("Scaling endpoint down to recycle old Blender 4 workers...")
    request_json(
        "PATCH",
        f"/endpoints/{ENDPOINT_ID}",
        {
            "workersMin": 0,
            "workersMax": 0,
            "idleTimeout": 1,
            "scalerType": "QUEUE_DELAY",
            "scalerValue": 4,
        },
    )
    time.sleep(20)

    print("Updating endpoint to Blender 5 template...")
    endpoint = request_json(
        "PATCH",
        f"/endpoints/{ENDPOINT_ID}",
        {
            "name": "jewelry-render-blender-v026-blender5",
            "templateId": template_id,
            "gpuCount": 1,
            "gpuTypeIds": ["NVIDIA GeForce RTX 4090"],
            "workersMin": 1,
            "workersMax": 2,
            "idleTimeout": 5,
            "executionTimeoutMs": 1800000,
            "scalerType": "QUEUE_DELAY",
            "scalerValue": 4,
        },
    )
    print(json.dumps({"endpointId": endpoint["id"], "templateId": endpoint["templateId"], "workersMin": endpoint["workersMin"], "workersMax": endpoint["workersMax"]}, indent=2))


if __name__ == "__main__":
    main()
