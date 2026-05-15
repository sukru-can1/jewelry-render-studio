from __future__ import annotations

import argparse
import json
import math
import os
import time
import urllib.request
from pathlib import Path


PUBLIC_BASE_URL = "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"'))


def request_json(url: str, api_key: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        method="POST" if payload is not None else "GET",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def download(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        output.write_bytes(response.read())


def make_contact_sheet(images: list[Path], labels: list[str], output: Path, tile_size: int) -> None:
    from PIL import Image, ImageDraw

    cols = min(3, max(1, len(images)))
    rows = math.ceil(len(images) / cols)
    label_h = 24
    sheet = Image.new("RGB", (cols * tile_size, rows * (tile_size + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (image_path, label) in enumerate(zip(images, labels)):
        col = index % cols
        row = index // cols
        x = col * tile_size
        y = row * (tile_size + label_h)
        with Image.open(image_path) as img:
            tile = img.convert("RGB")
            tile.thumbnail((tile_size, tile_size))
            paste_x = x + (tile_size - tile.width) // 2
            paste_y = y + label_h + (tile_size - tile.height) // 2
            sheet.paste(tile, (paste_x, paste_y))
        draw.text((x + 8, y + 6), label[:54], fill=(0, 0, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Submit a batch of RunPod recipe variants and build a contact sheet.")
    parser.add_argument("recipes", nargs="+")
    parser.add_argument("--endpoint-id", default="")
    parser.add_argument("--model-url", default="https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/ring99.blend")
    parser.add_argument("--model-pathname", default="models/ring99.blend")
    parser.add_argument("--output-root", default="outputs/ring99")
    parser.add_argument("--contact-sheet", required=True)
    parser.add_argument("--tile-size", type=int, default=360)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    return parser.parse_args()


def main() -> None:
    parsed = args()
    load_env(Path(".env"))
    api_key = os.environ.get("RUNPOD_API_KEY")
    endpoint_id = parsed.endpoint_id or os.environ.get("RUNPOD_ENDPOINT_ID", "4lvi3w848rqy0l")
    if not api_key:
        raise SystemExit("RUNPOD_API_KEY is missing.")

    jobs = []
    for recipe_path_raw in parsed.recipes:
        recipe_path = Path(recipe_path_raw)
        recipe = json.loads(recipe_path.read_text(encoding="utf-8-sig"))
        name = recipe.get("name") or recipe_path.stem
        output_prefix = f"{parsed.output_root.rstrip('/')}/{name}"
        payload = {
            "input": {
                "job_id": name,
                "model": {"url": parsed.model_url, "pathname": parsed.model_pathname},
                "recipe": recipe,
                "output": {"prefix": output_prefix},
            }
        }
        submitted = request_json(f"https://api.runpod.ai/v2/{endpoint_id}/run", api_key, payload)
        runpod_job_id = submitted.get("id") or submitted.get("jobId")
        if not runpod_job_id:
            raise SystemExit(json.dumps(submitted, indent=2))
        jobs.append({"name": name, "runpod_job_id": runpod_job_id, "output_prefix": output_prefix})
        print(json.dumps({"submitted": name, "runpod_job_id": runpod_job_id}))

    pending = {job["name"]: job for job in jobs}
    deadline = time.time() + parsed.timeout_seconds
    completed = {}
    while pending and time.time() < deadline:
        time.sleep(8)
        for name, job in list(pending.items()):
            status = request_json(f"https://api.runpod.ai/v2/{endpoint_id}/status/{job['runpod_job_id']}", api_key)
            state = status.get("status")
            print(json.dumps({"name": name, "status": state}))
            if state == "COMPLETED":
                completed[name] = status.get("output", {})
                del pending[name]
            elif state in {"FAILED", "CANCELLED", "TIMED_OUT"}:
                raise SystemExit(json.dumps({"name": name, "status": status}, indent=2))

    if pending:
        raise SystemExit(json.dumps({"error": "Timed out waiting for sweep.", "pending": sorted(pending)}, indent=2))

    image_paths = []
    labels = []
    for job in jobs:
        name = job["name"]
        image_url = completed[name].get("image_url") or f"{PUBLIC_BASE_URL}/{job['output_prefix']}/{name}.png"
        output_path = Path(parsed.output_root) / f"{name}.png"
        download(image_url, output_path)
        image_paths.append(output_path)
        labels.append(name)
        print(json.dumps({"name": name, "image_url": image_url}))

    make_contact_sheet(image_paths, labels, Path(parsed.contact_sheet), parsed.tile_size)
    print(json.dumps({"contact_sheet": parsed.contact_sheet}))


if __name__ == "__main__":
    main()
