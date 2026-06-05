# External Integrations

**Analysis Date:** 2026-06-05

## APIs & External Services

### RunPod Serverless GPU

- **What it does:** Executes Blender render jobs on GPU cloud workers
- **SDK/Client (web):** Native `fetch` calls in `lib/runpod.ts`
- **SDK/Client (worker):** `runpod==1.7.7` Python package; entry via `runpod.serverless.start({"handler": handler})` in `workers/runpod-blender/handler.py`
- **Auth:** `RUNPOD_API_KEY` env var (Bearer token)
- **Endpoint config:** `RUNPOD_ENDPOINT_ID` env var

**API calls made from `lib/runpod.ts`:**
```
POST https://api.runpod.ai/v2/{endpointId}/run         → submitRunPod()
GET  https://api.runpod.ai/v2/{endpointId}/status/{id} → getRunPodStatus()
```

**Job payload structure** (sent from `app/api/render-jobs/route.ts`):
```json
{
  "input": {
    "operation": "render" | "inspect_materials",
    "job_id": "<uuid>",
    "model": { "url": "...", "pathname": "..." },
    "reference_image": null | { "url": "...", "pathname": "..." },
    "recipe": { ... },
    "output": { "provider": "vercel_blob", "prefix": "outputs/...", "access": "public" }
  }
}
```

**Worker operations supported:**
- `render` — Blender Cycles render, upload PNG + JSON metadata to Blob
- `inspect_materials` — Run `inspect_materials.py` inside Blender, upload inventory JSON to Blob

**Progress updates:** `runpod.serverless.progress_update(job, "message")` called at each stage in `workers/runpod-blender/handler.py`

---

## Data Storage

### Vercel Blob (Primary and Only Datastore)

There is NO traditional database. All persistent state lives in Vercel Blob.

**SDK:** `@vercel/blob ^1.0.2` (web) and `vercel` Python package (worker)
**Auth:** `BLOB_READ_WRITE_TOKEN` env var on both web and worker

**Blob namespace layout:**
```
app-state/render-jobs/<uuid>.json   ← job state documents (created/updated by web API)
outputs/<model-name>/<uuid>/        ← render outputs uploaded by RunPod worker
  <uuid>.png                        ← rendered image
  <uuid>.json                       ← render metadata with object bounds, settings
  <uuid>_material_inventory.json    ← material inspection results (inspect_materials op)
uploads/                            ← user-uploaded model files and reference images
```

**Web-side Blob operations** (`lib/jobs.ts`):
- `put(path, json, { access: "public", allowOverwrite: true })` — create/update job state
- `list({ prefix: "app-state/render-jobs/", limit: 1000 })` — list all jobs
- Direct URL fetch via `BLOB_PUBLIC_BASE_URL` env var when set (faster than `list()`)

**Client-side upload flow** (`app/api/blob/upload/route.ts`):
- Uses `handleUpload` from `@vercel/blob/client` — generates short-lived client tokens
- Allowed content types: `.fbx`, `.glb`, `.gltf`, `.json`, `.png`, `.jpg`, `.webp`, `application/octet-stream`
- Token validated server-side; actual upload goes browser → Vercel Blob directly (no server relay)

**Worker-side Blob operations** (`workers/runpod-blender/handler.py`):
- `BlobClient(token=...).put(key, data, access=..., content_type=..., multipart=True)` — upload renders
- `BLOB_ACCESS` env var controls access level (defaults to `"public"`)

**Reading job state** (`lib/jobs.ts` → `getJob()`):
1. If `BLOB_PUBLIC_BASE_URL` is set: direct `fetch` to `${BLOB_PUBLIC_BASE_URL}/app-state/render-jobs/<id>.json`
2. Otherwise: `list({ prefix: ... })` then fetch the returned blob URL

---

## File Storage

**Provider:** Vercel Blob (same as job state — unified storage)
**Stored assets:**
- User-uploaded 3D models (FBX, GLB, GLTF)
- Reference images
- Rendered output PNG images
- Render metadata JSON files

**No local filesystem persistence** — the Vercel web runtime is stateless; all files go directly to Blob

---

## Blender (Local Subprocess on Worker)

- **Version:** 4.3.2 (installed in Docker image at `/opt/blender/blender`)
- **Invocation:** `subprocess.run(["blender", "--background", "--python", script, "--", ...args])` from `workers/runpod-blender/handler.py`
- **Scripts executed inside Blender process:**
  - `workers/runpod-blender/render_scene.py` — Cycles renderer; reads recipe JSON, builds scene, renders PNG
  - `workers/runpod-blender/inspect_materials.py` — Dumps material inventory to JSON
- **Timeout:** `BLENDER_TIMEOUT_SECONDS` env var; default 1800 seconds (30 min)
- **Post-processing:** `workers/runpod-blender/postprocess.py` (Pillow) runs after Blender exits, before upload

---

## CI/CD & Deployment

### Vercel (Web Frontend + API)

- **Project:** `jewelry-render-studio` (project ID `prj_I3y70TPePBfjGvxgjryDncHeSGVe`)
- **Auto-deploy:** Push to `main` triggers Vercel build
- **API route timeout:** 60 seconds (`vercel.json` → `functions: { "app/api/**/*.ts": { maxDuration: 60 } }`)
- **Framework detection:** `vercel.json` specifies `"framework": "nextjs"`

### GitHub Actions → GHCR (Worker Image)

- **Workflow:** `.github/workflows/runpod-worker-image.yml`
- **Trigger:** Push to `main` touching `workers/runpod-blender/**`; or manual dispatch with version tag
- **Registry:** GitHub Container Registry (`ghcr.io`)
- **Image name:** `ghcr.io/<owner-lowercase>/jewelry-render-worker`
- **Tags:** Version tag (from dispatch input or `sha-<12-char-sha>`) + `latest`
- **Platform:** `linux/amd64`
- **Auth:** `GITHUB_TOKEN` (auto-provided by Actions)

---

## Authentication & Identity

- **No user authentication** — the app has no login system
- **Service auth only:** API keys for RunPod and Vercel Blob stored as environment variables

---

## Monitoring & Observability

**Error Tracking:** None detected

**Logging:**
- Web: `console.log()` (e.g., blob upload events in `app/api/blob/upload/route.ts`)
- Worker: stdout/stderr captured from Blender subprocess; last 4000 chars returned in error payloads

---

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None — the web layer polls RunPod status on each GET request to `/api/render-jobs` and `/api/render-jobs/[id]`

---

## Environment Configuration

**Required env vars (web — Vercel):**
```
RUNPOD_API_KEY           # RunPod Bearer token
RUNPOD_ENDPOINT_ID       # RunPod serverless endpoint ID
BLOB_READ_WRITE_TOKEN    # Vercel Blob storage token
```

**Optional env vars (web):**
```
BLOB_PUBLIC_BASE_URL     # Base URL of Blob store; enables fast direct-URL reads for job state
                         # Without it, job reads fall back to blob.list() (slower)
```

**Required env vars (worker — RunPod container secrets):**
```
BLOB_READ_WRITE_TOKEN    # Vercel Blob write access for render output upload
```

**Optional env vars (worker):**
```
BLOB_ACCESS              # Blob access level for uploads; default: "public"
BLENDER_TIMEOUT_SECONDS  # Blender subprocess timeout; default: 1800 (30 minutes)
```

**Config health check:** `GET /api/config` returns booleans for each of the three required web vars (via `app/api/config/route.ts`)

---

## Legacy / Reference Only

`external-work/cloud-renderer-glmr/` contains a separate Flask app with its own RunPod endpoint (`4lvi3w848rqy0l`), SQLite database, and GHCR image (`ghcr.io/muge93/jewelry-render:latest`). This is **NOT part of the live stack** — it is a copied reference implementation. Its integrations should not be confused with the production system above.

---

*Integration audit: 2026-06-05*
