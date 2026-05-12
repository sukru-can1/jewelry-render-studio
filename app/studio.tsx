"use client";

import { upload } from "@vercel/blob/client";
import { FileSearch, ImageUp, Play, RefreshCw, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BlobAsset = {
  url: string;
  pathname: string;
  contentType?: string;
};

type RenderJob = {
  id: string;
  status: string;
  runpodJobId?: string;
  model: BlobAsset;
  referenceImage?: BlobAsset | null;
  recipe: Record<string, unknown>;
  outputPrefix: string;
  createdAt: string;
  updatedAt: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
};

type AppConfig = {
  blobConfigured: boolean;
  runpodApiConfigured: boolean;
  runpodEndpointConfigured: boolean;
};

const defaultRecipe = {
  name: "ring99_hybrid_catalog",
  material_strategy: "hybrid",
  render: {
    resolution: [1400, 1400],
    samples: 192,
    denoise: true
  },
  material_map: [
    { contains: ["metal", "band", "shank", "prong", "basket", "gold", "platinum", "silver"], material: "white_gold_polished" },
    { contains: ["center", "main", "diamond", "stone", "gem", "brilliant"], material: "diamond_center" },
    { contains: ["side", "pave", "small", "accent"], material: "diamond_side" }
  ],
  materials: {
    white_gold_polished: {
      type: "metal",
      base_color: [0.86, 0.84, 0.8, 1.0],
      metallic: 1.0,
      roughness: 0.14,
      specular_ior_level: 0.78
    },
    diamond_center: {
      type: "gem",
      base_color: [1.0, 0.98, 0.92, 1.0],
      roughness: 0.0,
      alpha: 0.24,
      transmission_weight: 1.0,
      ior: 2.417
    },
    diamond_side: {
      type: "gem",
      base_color: [1.0, 0.98, 0.94, 1.0],
      roughness: 0.0,
      alpha: 0.3,
      transmission_weight: 1.0,
      ior: 2.417
    }
  }
};

async function uploadBlob(prefix: string, file: File): Promise<BlobAsset> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await upload(`${prefix}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload"
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: file.type || "application/octet-stream"
  };
}

export default function Studio() {
  const [model, setModel] = useState<BlobAsset | null>(null);
  const [reference, setReference] = useState<BlobAsset | null>(null);
  const [recipeText, setRecipeText] = useState(JSON.stringify(defaultRecipe, null, 2));
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => model && recipeText.trim().startsWith("{"), [model, recipeText]);

  async function handleUpload(prefix: string, file: File | null, setter: (asset: BlobAsset) => void) {
    if (!file) return;
    setBusy(true);
    setMessage(`Uploading ${file.name}`);
    try {
      const asset = await uploadBlob(prefix, file);
      setter(asset);
      setMessage(`Uploaded ${asset.pathname}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshJobs() {
    const response = await fetch("/api/render-jobs", { cache: "no-store" });
    if (response.ok) setJobs(await response.json());
  }

  async function submit(path: string, body: object, label: string) {
    setBusy(true);
    setMessage(label);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await response.text());
      const job = await response.json();
      setJobs((current) => [job, ...current]);
      setMessage("Submitted to RunPod");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  function submitRender() {
    if (!model) return;
    submit(
      "/api/render-jobs",
      {
        model,
        referenceImage: reference,
        recipe: JSON.parse(recipeText)
      },
      "Submitting render job"
    );
  }

  function inspectMaterials() {
    if (!model) return;
    submit("/api/material-inspections", { model }, "Submitting material inspection");
  }

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setConfig)
      .catch(() => setConfig(null));
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 8000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="shell">
      <section className="header">
        <div>
          <p className="eyebrow">Vercel Blob + RunPod</p>
          <h1>Jewelry Render Studio</h1>
        </div>
        <button className="iconButton" onClick={refreshJobs} title="Refresh jobs">
          <RefreshCw size={18} />
        </button>
      </section>

      <section className="workspace">
        <div className="panel">
          <h2>Assets</h2>
          {config && !config.runpodEndpointConfigured && (
            <p className="setupWarning">RunPod endpoint is not configured yet. Uploads work, but render and inspection jobs cannot start.</p>
          )}
          <label className="drop">
            <UploadCloud size={22} />
            <span>{model ? model.pathname : "Upload BLEND, GLB, FBX, OBJ, or STL model"}</span>
            <input type="file" accept=".blend,.glb,.gltf,.fbx,.obj,.stl" onChange={(event) => handleUpload("models", event.target.files?.[0] || null, setModel)} />
          </label>
          <label className="drop">
            <ImageUp size={22} />
            <span>{reference ? reference.pathname : "Upload optional target reference image"}</span>
            <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => handleUpload("references", event.target.files?.[0] || null, setReference)} />
          </label>
        </div>

        <div className="panel recipePanel">
          <h2>Recipe</h2>
          <textarea value={recipeText} onChange={(event) => setRecipeText(event.target.value)} spellCheck={false} />
          <div className="actions">
            <button className="primary" disabled={!canSubmit || busy} onClick={submitRender}>
              <Play size={18} />
              Submit Render
            </button>
            <button className="secondary" disabled={!model || busy} onClick={inspectMaterials}>
              <FileSearch size={18} />
              Inspect Materials
            </button>
          </div>
          {message && <p className="message">{message}</p>}
        </div>

        <div className="panel">
          <h2>Jobs</h2>
          <div className="jobs">
            {jobs.length === 0 && <p className="empty">No render jobs yet.</p>}
            {jobs.map((job) => (
              <article className="job" key={job.id}>
                <div>
                  <strong>{job.id.slice(0, 10)}</strong>
                  <span>{job.status}</span>
                </div>
                <p>{job.model.pathname}</p>
                {job.error && <p className="error">{job.error}</p>}
                {job.result && <pre>{JSON.stringify(job.result, null, 2)}</pre>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
