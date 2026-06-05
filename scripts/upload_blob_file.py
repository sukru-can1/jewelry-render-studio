from __future__ import annotations

import argparse
import json
import mimetypes
import os
import urllib.request
from pathlib import Path


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"'))


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload a local file to Vercel Blob using the REST API.")
    parser.add_argument("--file", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env_file))
    token = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if not token:
        raise SystemExit("BLOB_READ_WRITE_TOKEN is missing.")

    file_path = Path(args.file)
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    url = f"https://blob.vercel-storage.com/{args.key.lstrip('/')}"
    request = urllib.request.Request(
        url,
        data=file_path.read_bytes(),
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "x-api-version": "6",
            "x-add-random-suffix": "false",
            "x-cache-control-max-age": "31536000",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        print(json.dumps(json.loads(response.read().decode("utf-8")), indent=2))


if __name__ == "__main__":
    main()
