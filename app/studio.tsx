"use client";

import defaultRecipeSource from "./default-recipe.json";
import { upload } from "@vercel/blob/client";
import { FileSearch, Images, ImageUp, Play, RefreshCw, UploadCloud } from "lucide-react";
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

type JsonRecord = Record<string, unknown>;

const defaultRecipeFallback = {
  name: "ring99_catalog_faceted_post",
  description:
    "Storefront studio recipe for ring99.blend. Uses source BLEND metal and side-stone materials, a renderer-controlled center diamond, and a targeted catalog post-process for center-stone facets.",
  material_strategy: "hybrid",
  render: {
    resolution: [1200, 1200],
    samples: 192,
    denoise: true,
    transparent: false,
    view_transform: "Filmic",
    look: "Medium High Contrast",
    exposure: 0.04,
    gamma: 1.0
  },
  camera: {
    position: [0.0, -5.05, 1.36],
    target: [0.0, 0.01, 0.14],
    focal_length: 98,
    depth_of_field: {
      enabled: true,
      f_stop: 11.0
    }
  },
  world: {
    color: [1.0, 1.0, 0.995],
    strength: 0.2
  },
  background: {
    color: [1.0, 1.0, 0.992, 1.0],
    plane_size: 40.0,
    plane_z: -0.12
  },
  model: {
    auto_center: true,
    auto_scale: true,
    target_size: 1.68,
    rotation_degrees: [50.0, 0.0, 0.0],
    translation: [0.0, 0.01, 0.0],
    ground_to_plane: true,
    ground_clearance: 0.012,
    shade_smooth: true,
    shade_smooth_exclude_contains: ["diamond", "stone", "gem", "round_", "emerald", "zirconia", "brillant"],
    include_contains: [],
    exclude_contains: ["light", "camera", "cube", "helper", "swatch", "plane"]
  },
  material_map: [
    { contains: ["Round_5"], material: "diamond_center" },
    { contains: ["stone_emerald"], source_material: "Diamond.001" },
    { contains: ["Diamond.001", "diamond"], source_material: "Diamond.001" },
    { contains: ["metal", "band", "shank", "prong", "basket"], source_material: "metal" }
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
      type: "catalog_diamond",
      glass_color: [1.0, 0.992, 0.975, 1.0],
      gloss_color: [1.0, 1.0, 1.0, 1.0],
      roughness: 0.0,
      gloss_roughness: 0.012,
      ior: 2.417,
      transparent_mix: 0.08
    },
    diamond_side: {
      type: "gem",
      base_color: [1.0, 0.98, 0.94, 1.0],
      roughness: 0.0,
      alpha: 0.3,
      transmission_weight: 1.0,
      ior: 2.417
    }
  },
  lights: [
    {
      name: "large_top_softbox",
      type: "AREA",
      position: [0.0, -1.25, 3.2],
      rotation_degrees: [62.0, 0.0, 0.0],
      size: 3.1,
      power: 375.0
    },
    {
      name: "left_front_strip",
      type: "AREA",
      position: [-2.4, -2.0, 1.25],
      rotation_degrees: [70.0, 0.0, -34.0],
      size: 1.1,
      power: 65.0
    },
    {
      name: "right_rim_strip",
      type: "AREA",
      position: [2.3, -0.15, 1.45],
      rotation_degrees: [78.0, 0.0, 45.0],
      size: 0.75,
      power: 75.0
    },
    {
      name: "diamond_sparkle_pin_1",
      type: "POINT",
      position: [-0.42, -1.05, 1.15],
      power: 120.0,
      shadow_soft_size: 0.018
    },
    {
      name: "diamond_sparkle_pin_2",
      type: "POINT",
      position: [0.62, -1.25, 1.35],
      power: 105.0,
      shadow_soft_size: 0.012
    },
    {
      name: "diamond_sparkle_pin_3",
      type: "POINT",
      position: [-0.95, -0.55, 1.75],
      power: 65.0,
      shadow_soft_size: 0.01
    }
  ],
  reflection_cards: [
    {
      name: "dark_lower_reflection",
      position: [0.0, -2.8, 0.35],
      rotation_degrees: [72.0, 0.0, 0.0],
      size: [3.6, 0.75],
      color: [0.34, 0.34, 0.344, 1.0],
      visible_to_camera: false
    },
    {
      name: "soft_gray_side_reflection",
      position: [2.4, -1.6, 0.85],
      rotation_degrees: [65.0, 0.0, 58.0],
      size: [1.8, 1.15],
      color: [0.8, 0.8, 0.804, 1.0],
      visible_to_camera: false
    },
    {
      name: "dark_upper_facet_reflection",
      position: [-1.1, -0.9, 2.28],
      rotation_degrees: [36.0, 0.0, -28.0],
      size: [2.6, 0.82],
      color: [0.34, 0.34, 0.344, 1.0],
      visible_to_camera: false
    },
    {
      name: "dark_overhead_table_reflection",
      position: [0.05, -0.35, 2.65],
      rotation_degrees: [0.0, 0.0, 12.0],
      size: [2.8, 1.25],
      color: [0.34, 0.34, 0.344, 1.0],
      visible_to_camera: false
    },
    {
      name: "left_dark_edge_reflection",
      position: [-2.15, -1.05, 1.15],
      rotation_degrees: [68.0, 0.0, -54.0],
      size: [1.4, 1.0],
      color: [0.34, 0.34, 0.344, 1.0],
      visible_to_camera: false
    },
    {
      name: "visible_white_backdrop",
      position: [0.0, 1.65, 1.25],
      rotation_degrees: [90.0, 0.0, 0.0],
      size: [8.0, 4.0],
      color: [1.0, 1.0, 0.995, 1.0],
      visible_to_camera: true
    }
  ],
  facet_overlay: {
    enabled: true,
    object_contains: ["Round_5"],
    radius_scale: 0.48,
    camera_offset: 0.014,
    facets: 20,
    inner_ratio: 0.16,
    y_scale: 0.82,
    dark_alpha: 0.16,
    light_alpha: 0.24,
    chroma_alpha: 0.1
  }
};

const defaultRecipe = defaultRecipeSource as JsonRecord;

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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecipe(recipe: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(recipe)) as JsonRecord;
}

function ensureRecord(parent: JsonRecord, key: string): JsonRecord {
  if (!isRecord(parent[key])) parent[key] = {};
  return parent[key] as JsonRecord;
}

function setGem(recipe: JsonRecord, materialName: string, transmission: number) {
  const materials = ensureRecord(recipe, "materials");
  const material = ensureRecord(materials, materialName);
  material.alpha = 1.0;
  material.roughness = 0.0;
  material.ior = 2.417;
  material.specular_ior_level = 1.0;
  material.transmission_weight = transmission;
}

function setSourceMaterialMap(recipe: JsonRecord, centerMaterial: string) {
  recipe.material_strategy = "hybrid";
  recipe.material_map = [
    centerMaterial === "diamond_center" ? { contains: ["Round_5"], material: "diamond_center" } : { contains: ["Round_5"], source_material: centerMaterial },
    { contains: ["stone_emerald"], source_material: "Diamond.001" },
    { contains: ["Diamond.001", "diamond"], source_material: "Diamond.001" },
    { contains: ["metal", "band", "shank", "prong", "basket"], source_material: "metal" }
  ];
}

function setFacetOverlay(recipe: JsonRecord, settings: JsonRecord) {
  const overlay = ensureRecord(recipe, "facet_overlay");
  overlay.enabled = true;
  Object.assign(overlay, settings);
}

function setReflectionCardTone(recipe: JsonRecord, dark: number, gray: number) {
  const cards = Array.isArray(recipe.reflection_cards) ? recipe.reflection_cards : [];
  for (const card of cards) {
    if (!isRecord(card) || typeof card.name !== "string") continue;
    if (card.name.includes("dark")) card.color = [dark, dark, dark + 0.004, 1.0];
    if (card.name.includes("gray")) card.color = [gray, gray, gray + 0.004, 1.0];
  }
}

function buildSweepRecipes(baseRecipe: JsonRecord): JsonRecord[] {
  const variants = [
    {
      suffix: "source-balanced",
      camera: { position: [0.0, -5.0, 1.82], target: [0.0, 0.0, 0.14], focal: 100 },
      rotation: [38.0, 0.0, 0.0],
      translation: [0.0, 0.01, 0.0],
      targetSize: 1.55,
      exposure: 0.025,
      worldStrength: 0.18,
      centerMaterial: "Diamond.001",
      darkCard: 0.28,
      grayCard: 0.74,
      overlay: { enabled: false }
    },
    {
      suffix: "source-contrast",
      camera: { position: [0.0, -5.0, 1.82], target: [0.0, 0.0, 0.14], focal: 100 },
      rotation: [38.0, 0.0, 0.0],
      translation: [0.0, 0.01, 0.0],
      targetSize: 1.55,
      exposure: -0.02,
      worldStrength: 0.12,
      centerMaterial: "Diamond.001",
      darkCard: 0.16,
      grayCard: 0.58,
      overlay: { enabled: false }
    },
    {
      suffix: "brighter-brilliant",
      camera: { position: [0.0, -5.0, 1.82], target: [0.0, 0.0, 0.14], focal: 100 },
      rotation: [38.0, 0.0, 0.0],
      translation: [0.0, 0.01, 0.0],
      targetSize: 1.55,
      exposure: 0.035,
      worldStrength: 0.2,
      centerMaterial: "diamond-brillant_aaa",
      darkCard: 0.32,
      grayCard: 0.78,
      overlay: { enabled: false }
    }
  ];

  return variants.map((variant) => {
    const recipe = cloneRecipe(baseRecipe);
    const baseName = typeof recipe.name === "string" ? recipe.name : "recipe";
    recipe.name = `${baseName}_sweep_${variant.suffix}`;

    const render = ensureRecord(recipe, "render");
    render.exposure = variant.exposure;

    const world = ensureRecord(recipe, "world");
    world.strength = variant.worldStrength;

    const camera = ensureRecord(recipe, "camera");
    camera.position = variant.camera.position;
    camera.target = variant.camera.target;
    camera.focal_length = variant.camera.focal;

    const model = ensureRecord(recipe, "model");
    model.target_size = variant.targetSize;
    model.rotation_degrees = variant.rotation;
    model.translation = variant.translation;

    setSourceMaterialMap(recipe, variant.centerMaterial);
    setReflectionCardTone(recipe, variant.darkCard, variant.grayCard);
    setFacetOverlay(recipe, variant.overlay);

    return recipe;
  });
}

function getJobImageUrl(job: RenderJob) {
  const output = isRecord(job.result) && isRecord(job.result.output) ? job.result.output : null;
  if (!output) return null;
  if (typeof output.image_url === "string") return output.image_url;
  if (isRecord(output.image_blob) && typeof output.image_blob.url === "string") return output.image_blob.url;
  return null;
}

function getRecipeName(job: RenderJob) {
  return typeof job.recipe.name === "string" ? job.recipe.name : "Untitled recipe";
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

  async function submitSweep() {
    if (!model) return;
    setBusy(true);
    setMessage("Submitting 3 sweep jobs");
    try {
      const baseRecipe = JSON.parse(recipeText) as JsonRecord;
      const submitted = await Promise.all(
        buildSweepRecipes(baseRecipe).map(async (recipe) => {
          const response = await fetch("/api/render-jobs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model, referenceImage: reference, recipe })
          });
          if (!response.ok) throw new Error(await response.text());
          return (await response.json()) as RenderJob;
        })
      );
      setJobs((current) => [...submitted, ...current]);
      setMessage("Submitted sweep to RunPod");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sweep submit failed");
    } finally {
      setBusy(false);
    }
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
            <button className="secondary" disabled={!canSubmit || busy} onClick={submitSweep}>
              <Images size={18} />
              Submit Sweep
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
            {jobs.map((job) => {
              const imageUrl = getJobImageUrl(job);
              return (
                <article className="job" key={job.id}>
                  <div>
                    <strong>{job.id.slice(0, 10)}</strong>
                    <span>{job.status}</span>
                  </div>
                  <p>{getRecipeName(job)}</p>
                  <p>{job.model.pathname}</p>
                  {imageUrl && (
                    <a className="previewLink" href={imageUrl} target="_blank" rel="noreferrer">
                      <img src={imageUrl} alt={`${getRecipeName(job)} render output`} />
                    </a>
                  )}
                  {job.error && <p className="error">{job.error}</p>}
                  {job.result && <pre>{JSON.stringify(job.result, null, 2)}</pre>}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
