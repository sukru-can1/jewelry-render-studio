# Vercel Deployment

The app is now designed for:

```text
Vercel Next.js app
Vercel Blob for models, references, output PNGs, and job JSON
RunPod Serverless for Blender/Cycles GPU rendering
```

## Why Client Uploads

`ring99.blend` is about 51 MB. Do not upload it through a Vercel Function.

Use Vercel Blob client uploads:

```text
browser -> Vercel Blob directly
```

The API route only grants an upload token; it does not receive the file body.

Vercel docs:

- Client uploads: https://vercel.com/docs/vercel-blob/client-upload
- Blob SDK: https://vercel.com/docs/vercel-blob/using-blob-sdk

## Required Environment Variables

Set these in Vercel Project Settings:

```text
BLOB_READ_WRITE_TOKEN
RUNPOD_API_KEY
RUNPOD_ENDPOINT_ID
BLOB_ACCESS=public
```

Current Vercel project:

```text
sukrus-projects-1b84f634/jewelry-render-studio
https://jewelry-render-studio.vercel.app
```

Created Blob stores during setup:

```text
jewelry-render-assets (store_zr1vwkVvsGXL5fNd)
jewelry-render-assets-linked (store_Rm1ZKmcYuUgu2Am6)
jewelry-render-assets-auto (store_IGO6ZTnGqZKmw5TS)
jewelry-render-assets-noninteractive (store_uuI6euQErTZONCUb)
```

The Vercel CLI created stores successfully but could not complete the interactive environment-selection prompt in this terminal. Link one public Blob store to `jewelry-render-studio` from the Vercel dashboard, then pull env locally:

```powershell
vercel env pull .env.local
```

Copy `BLOB_READ_WRITE_TOKEN` from `.env.local` into `.env` and into the RunPod worker environment.

Set these on the RunPod worker:

```text
BLOB_READ_WRITE_TOKEN
BLOB_ACCESS=public
BLENDER_TIMEOUT_SECONDS=1800
```

Use `public` Blob access for the first test so RunPod can download the model URL directly and the dashboard can show output URLs. For production, we can switch to private access and signed access patterns.

## One-Time CLI Upload

After the Vercel project has a Blob store and `.env` contains `BLOB_READ_WRITE_TOKEN`, this is valid for testing:

```powershell
vercel blob put .\blend\ring99.blend --pathname models/ring99.blend --access public
```

The production app flow still uses the browser upload control.

## First Test

1. Create Vercel project.
2. Add Blob store.
3. Set `BLOB_READ_WRITE_TOKEN` in Vercel and local `.env`.
4. Start Docker Desktop.
5. Build and push the RunPod worker image.
6. Create the RunPod Serverless endpoint.
7. Set `RUNPOD_ENDPOINT_ID`.
8. Redeploy Vercel.
9. Upload `ring99.blend`.
10. Click `Inspect Materials`.
11. Use the material inventory to refine `recipes/ring99_hybrid_catalog.json`.

## RunPod Worker Deployment

RunPod's current serverless workflow is: build a worker image, push it to a registry, create a serverless template from that image, then create an endpoint from the template.

Build and optionally push:

```powershell
.\scripts\publish_runpod_worker.ps1 -Image docker.io/YOUR_DOCKERHUB_USER/jewelry-render-worker -Version v0.1.0 -Push
```

Create the RunPod template and endpoint:

```powershell
python scripts\create_runpod_endpoint.py --image docker.io/YOUR_DOCKERHUB_USER/jewelry-render-worker:v0.1.0
```

The script prints:

```text
RUNPOD_ENDPOINT_ID=...
```

Add it to Vercel:

```powershell
vercel env add RUNPOD_ENDPOINT_ID production --value <endpoint_id> --yes
vercel env add RUNPOD_ENDPOINT_ID development --value <endpoint_id> --yes
vercel deploy --prod --yes
```

RunPod docs referenced:

- Custom worker quickstart: https://docs.runpod.io/serverless/workers/custom-worker
- Deploy workers from Docker Hub: https://docs.runpod.io/serverless/workers/deploy
- Create template API: https://docs.runpod.io/api-reference/templates/POST/templates
- Create endpoint API: https://docs.runpod.io/api-reference/endpoints/POST/endpoints
