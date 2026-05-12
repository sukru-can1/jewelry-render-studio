import argparse
import json
import os
import sys
import urllib.error
import urllib.request
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
        if not os.environ.get(key):
            os.environ[key] = value.strip().strip('"')


def request_json(method: str, path: str, api_key: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{RUNPOD_REST}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"RunPod API error {exc.code}: {detail}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a RunPod Serverless endpoint for the Blender worker.")
    parser.add_argument("--image", required=True, help="Published worker image, e.g. docker.io/user/jewelry-render-worker:v0.1.0")
    parser.add_argument("--name", default="jewelry-render-blender", help="Endpoint/template base name")
    parser.add_argument("--gpu", default="NVIDIA GeForce RTX 4090", help="RunPod GPU type ID")
    parser.add_argument("--workers-min", type=int, default=0)
    parser.add_argument("--workers-max", type=int, default=1)
    parser.add_argument("--idle-timeout", type=int, default=5)
    parser.add_argument("--execution-timeout-ms", type=int, default=1800000)
    parser.add_argument("--container-disk-gb", type=int, default=50)
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--update-endpoint-id", default="", help="Patch an existing endpoint instead of creating a new one")
    args = parser.parse_args()

    load_env(Path(args.env_file))
    api_key = os.environ.get("RUNPOD_API_KEY")
    blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not api_key:
        raise SystemExit("RUNPOD_API_KEY is missing.")
    if not blob_token:
        raise SystemExit("BLOB_READ_WRITE_TOKEN is missing. Pull it from Vercel env first.")

    template_payload = {
        "name": f"{args.name}-template",
        "imageName": args.image,
        "category": "NVIDIA",
        "containerDiskInGb": args.container_disk_gb,
        "dockerEntrypoint": [],
        "dockerStartCmd": [],
        "env": {
            "BLOB_READ_WRITE_TOKEN": blob_token,
            "BLOB_ACCESS": os.environ.get("BLOB_ACCESS", "public"),
            "BLENDER_TIMEOUT_SECONDS": os.environ.get("BLENDER_TIMEOUT_SECONDS", "1800"),
        },
        "isPublic": False,
        "isServerless": True,
        "ports": [],
        "readme": "Blender/Cycles worker for Jewelry Render Studio.",
        "volumeInGb": 0,
        "volumeMountPath": "/workspace",
    }
    print("Creating RunPod template...")
    template = request_json("POST", "/templates", api_key, template_payload)
    template_id = template["id"]
    print(f"Template ID: {template_id}")

    endpoint_payload = {
        "name": args.name,
        "templateId": template_id,
        "computeType": "GPU",
        "gpuCount": 1,
        "gpuTypeIds": [args.gpu],
        "workersMin": args.workers_min,
        "workersMax": args.workers_max,
        "idleTimeout": args.idle_timeout,
        "executionTimeoutMs": args.execution_timeout_ms,
        "scalerType": "QUEUE_DELAY",
        "scalerValue": 4,
    }
    if args.update_endpoint_id:
        print(f"Updating RunPod endpoint {args.update_endpoint_id}...")
        endpoint = request_json("PATCH", f"/endpoints/{args.update_endpoint_id}", api_key, endpoint_payload)
    else:
        print("Creating RunPod endpoint...")
        endpoint = request_json("POST", "/endpoints", api_key, endpoint_payload)
    endpoint_id = endpoint["id"]
    print(json.dumps({"template": template, "endpoint": endpoint}, indent=2))
    print()
    print(f"RUNPOD_ENDPOINT_ID={endpoint_id}")
    print()
    print("Next:")
    print(f"  vercel env add RUNPOD_ENDPOINT_ID production --value {endpoint_id} --yes")
    print(f"  vercel env add RUNPOD_ENDPOINT_ID development --value {endpoint_id} --yes")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
