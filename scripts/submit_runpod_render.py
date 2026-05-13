from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
import uuid
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"'))


def request_json(url: str, api_key: str, payload: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def download(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        output.write_bytes(response.read())


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--model-url", default="https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/ring99.blend")
    parser.add_argument("--model-pathname", default="models/ring99.blend")
    parser.add_argument("--output-prefix", default="")
    parser.add_argument("--download-to", default="")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    return parser.parse_args()


def main():
    parsed = args()
    load_env(Path(".env"))
    api_key = os.environ.get("RUNPOD_API_KEY")
    endpoint_id = os.environ.get("RUNPOD_ENDPOINT_ID", "4lvi3w848rqy0l")
    if not api_key:
        raise SystemExit("RUNPOD_API_KEY is missing.")

    job_id = str(uuid.uuid4())
    recipe = json.loads(Path(parsed.recipe).read_text(encoding="utf-8"))
    output_prefix = parsed.output_prefix or f"outputs/ring99/{job_id}"
    payload = {
        "input": {
            "job_id": job_id,
            "model": {"url": parsed.model_url, "pathname": parsed.model_pathname},
            "recipe": recipe,
            "output": {"prefix": output_prefix},
        }
    }

    submitted = request_json(f"https://api.runpod.ai/v2/{endpoint_id}/run", api_key, payload)
    runpod_job_id = submitted.get("id") or submitted.get("jobId")
    if not runpod_job_id:
        raise SystemExit(json.dumps(submitted, indent=2))
    print(json.dumps({"job_id": job_id, "runpod_job_id": runpod_job_id, "output_prefix": output_prefix}, indent=2))

    deadline = time.time() + parsed.timeout_seconds
    status = {}
    while time.time() < deadline:
        time.sleep(8)
        status = request_json(f"https://api.runpod.ai/v2/{endpoint_id}/status/{runpod_job_id}", api_key)
        state = status.get("status")
        print(state)
        if state in {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}:
            break

    if status.get("status") != "COMPLETED":
        print(json.dumps(status, indent=2))
        raise SystemExit(1)

    output = status.get("output", {})
    image_url = output.get("image_url")
    if parsed.download_to and image_url:
        download(image_url, Path(parsed.download_to))
    print(json.dumps({"image_url": image_url, "metadata_blob": output.get("metadata_blob")}, indent=2))


if __name__ == "__main__":
    main()
