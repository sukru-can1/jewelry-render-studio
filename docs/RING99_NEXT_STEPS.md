# Ring99 Cloud Setup

Local source asset found:

```text
C:\git-projects\codex_render\blend\ring99.blend
```

This file is ignored by git through `blend/`.

## Blocked Values

To submit the first cloud material inspection, fill these in `.env`, Vercel project environment, and RunPod worker environment:

```text
RUNPOD_ENDPOINT_ID=
BLOB_READ_WRITE_TOKEN=
```

The RunPod API key is already present locally, but it should be rotated before production because it was pasted in chat.

## First Cloud Job

After the RunPod endpoint and Vercel Blob are configured:

1. Upload `blend/ring99.blend` in the dashboard.
2. Click `Inspect Materials`.
3. Review the generated `material_inventory.json`.
4. Use `recipes/ring99_hybrid_catalog.json` for the first render.

The inspection tells us the exact object names and material slots, so we can tighten the `material_map` instead of guessing.
