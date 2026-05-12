# Jewelry Render Studio

Cloud-first, recipe-driven Blender/Cycles rendering system for photorealistic jewelry catalog images.

The goal is to make the studio environment programmable: lights, world strength, camera, material presets, gemstone sparkle, shadow softness, color management, and output settings all live in recipe files so Codex can iterate on them.

## Cloud Architecture

```text
Next.js dashboard on Vercel
  -> Vercel API routes for RunPod orchestration
  -> Vercel Blob for models, references, outputs, job state
  -> RunPod Serverless Blender/Cycles GPU worker
```

The web/API services do not render locally. They upload assets to Vercel Blob, submit jobs to RunPod, poll status, and display results.

## First Workflow

1. Upload a GLB, FBX, BLEND, OBJ, or STL model.
2. Upload an optional target reference image.
3. Edit the render recipe in the dashboard.
4. Submit the render job to RunPod.
5. Review the returned PNG and metadata.
6. Adjust the recipe and rerun until the studio look is right.

## Cloud Setup

See:

```text
docs/VERCEL_DEPLOYMENT.md
```

Required next values:

```text
RUNPOD_ENDPOINT_ID
BLOB_READ_WRITE_TOKEN
```

## What To Tune First

For the attached render, start with:

- Increase diamond sparkle lights, but keep them small.
- Use a larger softbox for smoother premium shadows.
- Add black/gray reflection cards so white metal has controlled contrast.
- Use higher transmission depth and lower roughness for stones.
- Raise render samples only after lighting direction is close.

## Project Shape

```text
recipes/           Render recipes and parameter sweeps
scripts/           Batch runner, Blender renderer, contact sheet tool
models/            Local input models, ignored by git
outputs/           Generated renders, ignored by git
app/               Next.js Vercel app and API routes
lib/               RunPod and Blob-backed job helpers
workers/runpod-blender/ RunPod Blender worker
```
