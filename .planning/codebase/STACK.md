# Technology Stack

**Analysis Date:** 2026-06-05

## Languages

**Primary:**
- TypeScript 5.7 — Next.js web app, API routes, shared lib (`*.ts`, `*.tsx` under `app/`, `lib/`)
- Python 3 (system Python in Ubuntu 22.04 container) — GPU worker (`workers/runpod-blender/`), local iteration scripts (`scripts/`)

**Secondary:**
- JavaScript (auto-generated `.js` build artifacts) — not authored directly

## Two-Runtime Architecture

This project has two distinct runtimes that never share process space:

| Runtime | Location | Deployment |
|---------|----------|------------|
| TypeScript / Node.js | `app/`, `lib/` | Vercel (Edge/Node.js functions) |
| Python 3 + Blender | `workers/runpod-blender/` | RunPod serverless GPU container |

## Runtime

**Web Runtime:**
- Node.js (managed by Vercel; target ES2017 output per `tsconfig.json`)
- No `.nvmrc` or `.node-version` present — version is pinned by Vercel platform

**GPU Worker Runtime:**
- Python 3 (system `python3` in `nvidia/cuda:12.4.1-runtime-ubuntu22.04`)
- Blender 4.3.2 (downloaded from blender.org at image build time, installed to `/opt/blender/`)

**Package Manager:**
- npm (web) — `package.json` present, lockfile: not detected in repo (likely gitignored)
- pip (worker) — `workers/runpod-blender/requirements.txt`

## Frameworks

**Core Web:**
- Next.js `^15.1.4` — App Router, server components, API routes
- React `^19.0.0` / react-dom `^19.0.0` — UI rendering

**Build/Dev:**
- TypeScript `^5.7.2` — strict mode enabled (`tsconfig.json`)
- `next dev` / `next build` / `next start` (scripts in `package.json`)

**Testing:**
- No test framework detected

## Key Dependencies

**Critical (web):**
- `@vercel/blob ^1.0.2` — All file storage AND job-state persistence (no database)
- `next ^15.1.4` — Full-stack framework; API routes in `app/api/`
- `react ^19.0.0` — UI

**Critical (worker):**
- `runpod==1.7.7` — RunPod serverless SDK; entrypoint via `runpod.serverless.start()` in `workers/runpod-blender/handler.py`
- `requests==2.32.3` — HTTP downloads (model assets, blob URLs)
- `vercel==<latest>` — Vercel Blob Python SDK; used in `workers/runpod-blender/handler.py` via `vercel.blob.BlobClient`
- `Pillow==10.4.0` — Post-processing rendered images in `workers/runpod-blender/postprocess.py`

**UI:**
- `lucide-react ^0.468.0` — Icon library

**Dev-only (web):**
- `@types/node ^22.10.5`
- `@types/react ^19.0.4`
- `@types/react-dom ^19.0.2`

**Local scripts (`requirements.txt` at repo root):**
- `Pillow>=10.0` — Image inspection utilities in `scripts/`

## Blender

**Version:** 4.3.2 (production worker)
**Install:** Downloaded via curl from `download.blender.org` into Docker image; symlinked to `/usr/local/bin/blender`
**Usage:** Invoked as a headless subprocess by `workers/runpod-blender/handler.py`:
```
blender --background --python <render_scene.py or inspect_materials.py> -- [args]
```
**Render engine:** Blender Cycles (configured inside `workers/runpod-blender/render_scene.py`)
**Python API (`bpy`):** Used directly inside `render_scene.py` and `inspect_materials.py` — these run inside the Blender process

## Configuration

**Environment (web/Vercel):**
- `RUNPOD_API_KEY` — RunPod Bearer token
- `RUNPOD_ENDPOINT_ID` — RunPod serverless endpoint ID
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob read/write token
- `BLOB_PUBLIC_BASE_URL` — Optional; enables direct URL fetch for job state instead of `blob.list()`

**Environment (worker/RunPod container):**
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob write access for render output upload
- `BLOB_ACCESS` — Blob access level; defaults to `"public"` (`workers/runpod-blender/handler.py:55`)
- `BLENDER_TIMEOUT_SECONDS` — Blender subprocess timeout; defaults to `1800` (30 min) (`workers/runpod-blender/handler.py:74`)

**Build:**
- `next.config.ts` — minimal; `typedRoutes: false`
- `tsconfig.json` — strict TypeScript, `moduleResolution: bundler`, path alias `@/*` → `./*`
- `vercel.json` — framework: `nextjs`; all `app/api/**/*.ts` routes get `maxDuration: 60`

## Platform Requirements

**Development:**
- Node.js (any version compatible with Next.js 15)
- `npm install && npm run dev`
- Python 3 + Pillow for running local `scripts/`

**Production:**
- Web: Vercel (auto-deploy on git push; project ID `prj_I3y70TPePBfjGvxgjryDncHeSGVe`)
- Worker: RunPod serverless GPU — Docker image built via GitHub Actions CI, pushed to GHCR (`ghcr.io/<owner>/jewelry-render-worker`)

## Container (Worker)

**Base image:** `nvidia/cuda:12.4.1-runtime-ubuntu22.04`
**Build context:** Repo root (Dockerfile at `workers/runpod-blender/Dockerfile`)
**CI trigger:** Push to `main` touching `workers/runpod-blender/**` or `.github/workflows/runpod-worker-image.yml`
**Entry point:** `python3 -u handler.py`

## Legacy / Reference Only

`external-work/cloud-renderer-glmr/` is a **separate nested git repo** (Flask-based renderer, NOT part of the live stack). Its tech for reference:
- Flask + Flask-SQLAlchemy + SQLite (`models.py`) — local web server
- Blender 4.2.0 (legacy version vs. 4.3.2 in production)
- `trimesh` — OBJ→GLB preview generation
- RunPod SDK — cloud dispatch (endpoint `4lvi3w848rqy0l`)
- GitHub Actions → `ghcr.io/muge93/jewelry-render:latest`
- **Do not modify or depend on this directory** — it is reference/copied legacy code only

---

*Stack analysis: 2026-06-05*
