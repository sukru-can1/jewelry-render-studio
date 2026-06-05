"use client";

import "./styles.css";
import { upload } from "@vercel/blob/client";
import {
  BadgeCheck,
  Boxes,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  FileSearch,
  Image,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  UploadCloud,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  EnterpriseAngleKey,
  EnterpriseGroupKey,
  EnterpriseGroupTokens,
  EnterpriseMetal,
  EnterprisePass,
  EnterpriseStoneMaterial
} from "@/lib/enterprise-recipes";
import { buildEnterpriseRecipe, enterpriseAngles, enterpriseMetalLabels } from "@/lib/enterprise-recipes";
import type { BlobAsset, RenderJob } from "@/lib/types";

type AppConfig = {
  blobConfigured: boolean;
  runpodApiConfigured: boolean;
  runpodEndpointConfigured: boolean;
};

type InventoryObject = {
  name: string;
  type?: string;
  material_slots?: Array<string | null>;
  bounds?: { max_dimension?: number; size?: number[] };
};

type Inventory = {
  objects?: InventoryObject[];
  materials?: Array<{ name: string }>;
};

type ClassifiedObject = {
  id: string;
  name: string;
  materials: string[];
  group: EnterpriseGroupKey | "other";
  maxDimension: number;
};

type Product = {
  asset: BlobAsset;
  fileName: string;
  inspectionJobId?: string;
  inventoryUrl?: string;
  inventory?: Inventory;
  objects: ClassifiedObject[];
};

const GROUP_LABELS: Record<ClassifiedObject["group"], string> = {
  alloycolour: "Metal",
  diamond: "Diamond",
  stone2: "Stone 2",
  stone3: "Stone 3",
  other: "Other"
};

const STONE_LABELS: Record<EnterpriseStoneMaterial, string> = {
  diamond: "Diamond clear",
  sapphire: "Blue sapphire",
  emerald: "Green emerald",
  ruby: "Red ruby"
};

const BAD_STATUSES = new Set(["FAILED", "CANCELLED", "TIMED_OUT"]);

const DEFAULT_GROUP_TOKENS: EnterpriseGroupTokens = {
  alloycolour: ["metal", "band", "ring", "shank", "prong", "basket", "gold", "silver", "platinum", "alloy"],
  diamond: ["diamond", "brilliant", "round", "center", "pave", "zirconia", "gem", "stone"],
  stone2: ["stone2", "sapphire", "emerald", "ruby", "colored"],
  stone3: ["stone3", "accent", "side_stone"]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getJobOutput(job: RenderJob) {
  return isRecord(job.result) && isRecord(job.result.output) ? job.result.output : null;
}

function getJobImageUrl(job: RenderJob) {
  const output = getJobOutput(job);
  if (!output) return "";
  if (typeof output.image_url === "string") return output.image_url;
  if (isRecord(output.image_blob) && typeof output.image_blob.url === "string") return output.image_blob.url;
  return "";
}

function getInventoryUrl(job: RenderJob) {
  const output = getJobOutput(job);
  if (!output) return "";
  if (typeof output.inventory_url === "string") return output.inventory_url;
  if (isRecord(output.inventory_blob) && typeof output.inventory_blob.url === "string") return output.inventory_blob.url;
  return "";
}

function recipeName(job: RenderJob) {
  return typeof job.recipe.name === "string" ? job.recipe.name : job.id.slice(0, 8);
}

function recipeEnterprise(job: RenderJob) {
  return isRecord(job.recipe.enterprise) ? job.recipe.enterprise : null;
}

function statusClass(status: string) {
  if (status === "COMPLETED") return "done";
  if (BAD_STATUSES.has(status)) return "bad";
  return "pending";
}

function statusIcon(status: string) {
  if (status === "COMPLETED") return <Check size={15} />;
  if (BAD_STATUSES.has(status)) return <XCircle size={15} />;
  return <Clock size={15} />;
}

function classifyObject(item: InventoryObject, index: number): ClassifiedObject {
  const materials = (item.material_slots || []).filter((name): name is string => Boolean(name));
  const signature = `${item.name} ${materials.join(" ")}`.toLowerCase();
  const maxDimension = Number(item.bounds?.max_dimension || 0);
  let group: ClassifiedObject["group"] = "other";

  if (/sapphire|emerald|ruby|topaz|amethyst|opal|colored|stone2/.test(signature)) {
    group = "stone2";
  } else if (/stone3|accent/.test(signature)) {
    group = "stone3";
  } else if (/diamond|brilliant|round|zirconia|pave|gem|stone|center/.test(signature)) {
    group = "diamond";
  } else if (/metal|band|ring|shank|prong|basket|gold|silver|platinum|alloy|white|yellow|rose/.test(signature)) {
    group = "alloycolour";
  }

  return {
    id: `${item.name}-${index}`,
    name: item.name,
    materials,
    group,
    maxDimension
  };
}

function buildGroupTokens(objects: ClassifiedObject[]): EnterpriseGroupTokens {
  const tokens: EnterpriseGroupTokens = {
    alloycolour: [],
    diamond: [],
    stone2: [],
    stone3: []
  };

  for (const object of objects) {
    if (object.group === "other") continue;
    tokens[object.group].push(object.name, ...object.materials);
  }

  return {
    alloycolour: tokens.alloycolour.length ? tokens.alloycolour : DEFAULT_GROUP_TOKENS.alloycolour,
    diamond: tokens.diamond.length ? tokens.diamond : DEFAULT_GROUP_TOKENS.diamond,
    stone2: tokens.stone2.length ? tokens.stone2 : DEFAULT_GROUP_TOKENS.stone2,
    stone3: tokens.stone3.length ? tokens.stone3 : DEFAULT_GROUP_TOKENS.stone3
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
}

function countByGroup(objects: ClassifiedObject[]) {
  return objects.reduce(
    (counts, object) => {
      counts[object.group] = (counts[object.group] || 0) + 1;
      return counts;
    },
    {} as Record<ClassifiedObject["group"], number>
  );
}

export default function EnterpriseApp() {
  const [product, setProduct] = useState<Product | null>(null);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [metals, setMetals] = useState<Record<EnterpriseMetal, boolean>>({ white: true, yellow: true, rose: true });
  const [angles, setAngles] = useState<Record<EnterpriseAngleKey, boolean>>({ hero: true, front: true, top: true, profile: true });
  const [passes, setPasses] = useState<Record<EnterprisePass, boolean>>({ full: true, metal: false, stone: false });
  const [stoneGroups, setStoneGroups] = useState<Record<Exclude<EnterpriseGroupKey, "alloycolour">, boolean>>({
    diamond: true,
    stone2: false,
    stone3: false
  });
  const [stoneMaterials, setStoneMaterials] = useState<Record<Exclude<EnterpriseGroupKey, "alloycolour">, EnterpriseStoneMaterial>>({
    diamond: "diamond",
    stone2: "sapphire",
    stone3: "emerald"
  });
  const [resolution, setResolution] = useState(1200);
  const [samples, setSamples] = useState(520);

  const productJobs = useMemo(() => {
    const idSet = new Set(submittedIds);
    return jobs.filter((job) => idSet.has(job.id) || recipeEnterprise(job)?.workflow === "production_catalog").slice(0, 80);
  }, [jobs, submittedIds]);

  const completedJobs = useMemo(() => productJobs.filter((job) => getJobImageUrl(job)), [productJobs]);
  const groupCounts = useMemo(() => countByGroup(product?.objects || []), [product?.objects]);

  const plannedRecipes = useMemo(() => {
    if (!product) return [];
    const selectedMetals = (Object.keys(metals) as EnterpriseMetal[]).filter((key) => metals[key]);
    const selectedAngles = (Object.keys(angles) as EnterpriseAngleKey[]).filter((key) => angles[key]);
    const selectedStoneGroups = (Object.keys(stoneGroups) as Array<Exclude<EnterpriseGroupKey, "alloycolour">>).filter(
      (key) => stoneGroups[key]
    );
    const groupTokens = buildGroupTokens(product.objects);
    const recipes: Record<string, unknown>[] = [];

    if (passes.full) {
      for (const metal of selectedMetals) {
        for (const angle of selectedAngles) {
          recipes.push(
            buildEnterpriseRecipe({
              angle,
              groupTokens,
              metal,
              pass: "full",
              productName: product.fileName,
              resolution,
              samples,
              stoneMaterials
            })
          );
        }
      }
    }

    if (passes.metal) {
      for (const metal of selectedMetals) {
        for (const angle of selectedAngles) {
          recipes.push(
            buildEnterpriseRecipe({
              angle,
              groupTokens,
              metal,
              pass: "metal",
              productName: product.fileName,
              resolution,
              samples,
              stoneMaterials
            })
          );
        }
      }
    }

    if (passes.stone) {
      for (const stoneGroup of selectedStoneGroups) {
        for (const angle of selectedAngles) {
          recipes.push(
            buildEnterpriseRecipe({
              angle,
              groupTokens,
              metal: "white",
              pass: "stone",
              productName: product.fileName,
              resolution,
              samples,
              stoneGroup,
              stoneMaterials
            })
          );
        }
      }
    }

    return recipes;
  }, [angles, metals, passes, product, resolution, samples, stoneGroups, stoneMaterials]);

  async function refreshJobs() {
    try {
      const response = await fetch("/api/render-jobs", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setJobs((await response.json()) as RenderJob[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh jobs");
    }
  }

  async function inspectProduct(nextProduct = product) {
    if (!nextProduct) return;
    setBusy(true);
    setMessage("Submitting material inspection");
    try {
      const response = await fetch("/api/material-inspections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: nextProduct.asset })
      });
      if (!response.ok) throw new Error(await response.text());
      const job = (await response.json()) as RenderJob;
      setJobs((current) => [job, ...current]);
      setProduct({ ...nextProduct, inspectionJobId: job.id });
      setMessage("Inspection queued");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(`Uploading ${file.name}`);
    try {
      const asset = await uploadBlob("enterprise-models", file);
      const nextProduct: Product = { asset, fileName: file.name, objects: [] };
      setProduct(nextProduct);
      setSubmittedIds([]);
      setMessage("Upload complete. Inspecting model.");
      await inspectProduct(nextProduct);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadInventory(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load inspection inventory");
    const inventory = (await response.json()) as Inventory;
    const objects = (inventory.objects || []).filter((item) => item.type === "MESH").map(classifyObject);
    setProduct((current) => (current ? { ...current, inventoryUrl: url, inventory, objects } : current));
    setMessage(`Inspection loaded: ${objects.length} mesh objects`);
  }

  function updateObjectGroup(id: string, group: ClassifiedObject["group"]) {
    setProduct((current) =>
      current
        ? {
            ...current,
            objects: current.objects.map((object) => (object.id === id ? { ...object, group } : object))
          }
        : current
    );
  }

  async function submitBatch() {
    if (!product || !plannedRecipes.length) return;
    setBusy(true);
    setMessage(`Submitting ${plannedRecipes.length} render jobs`);
    try {
      const submitted: RenderJob[] = [];
      for (const recipe of plannedRecipes) {
        const response = await fetch("/api/render-jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: product.asset, recipe })
        });
        if (!response.ok) throw new Error(await response.text());
        submitted.push((await response.json()) as RenderJob);
      }
      setSubmittedIds((current) => [...submitted.map((job) => job.id), ...current]);
      setJobs((current) => [...submitted, ...current]);
      setMessage(`Submitted ${submitted.length} jobs`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Batch submit failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setConfig)
      .catch(() => setConfig(null));
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!product?.inspectionJobId || product.inventoryUrl) return;
    const job = jobs.find((item) => item.id === product.inspectionJobId);
    if (!job || job.status !== "COMPLETED") return;
    const inventoryUrl = getInventoryUrl(job);
    if (!inventoryUrl) return;
    loadInventory(inventoryUrl).catch((error) => setMessage(error instanceof Error ? error.message : "Inventory load failed"));
  }, [jobs, product?.inspectionJobId, product?.inventoryUrl]);

  return (
    <main className="enterpriseShell">
      <section className="enterpriseTop">
        <div>
          <p className="eyebrow">Production render pipeline</p>
          <h1>Jewelry Catalog Renderer</h1>
        </div>
        <div className="enterpriseActions">
          <a className="secondary" href="/rater">
            <Image size={18} />
            Live Renders
          </a>
          <button className="iconButton" onClick={refreshJobs} title="Refresh jobs">
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      {config && (!config.blobConfigured || !config.runpodApiConfigured || !config.runpodEndpointConfigured) && (
        <section className="enterpriseNotice">
          Missing configuration: {!config.blobConfigured ? "Vercel Blob " : ""}
          {!config.runpodApiConfigured ? "RunPod API " : ""}
          {!config.runpodEndpointConfigured ? "RunPod endpoint" : ""}
        </section>
      )}

      <section className="enterpriseGrid">
        <div className="enterpriseColumn">
          <section className="enterprisePanel">
            <div className="panelTitle">
              <UploadCloud size={18} />
              <h2>Product Upload</h2>
            </div>
            <label className="enterpriseDrop">
              <input accept=".glb,.gltf,.fbx,.blend,.obj,.stl" type="file" onChange={(event) => handleUpload(event.target.files?.[0] || null)} />
              <UploadCloud size={24} />
              <span>{product ? product.fileName : "Upload GLB, FBX, BLEND, OBJ, or STL"}</span>
            </label>
            {product && (
              <div className="assetMeta">
                <span>{product.asset.pathname}</span>
                <a href={product.asset.url} target="_blank" rel="noreferrer">
                  Open source <ExternalLink size={14} />
                </a>
              </div>
            )}
            <div className="actions compactActions">
              <button className="secondary" disabled={!product || busy} onClick={() => inspectProduct()}>
                <FileSearch size={18} />
                Inspect Again
              </button>
            </div>
          </section>

          <section className="enterprisePanel">
            <div className="panelTitle">
              <Boxes size={18} />
              <h2>Detected Parts</h2>
            </div>
            {!product?.objects.length && <p className="empty">Upload a model and run inspection to classify metal and stones.</p>}
            {product?.objects.length ? (
              <>
                <div className="partSummary">
                  {Object.entries(GROUP_LABELS).map(([key, label]) => (
                    <span key={key}>
                      {label}: {groupCounts[key as ClassifiedObject["group"]] || 0}
                    </span>
                  ))}
                </div>
                <div className="partList">
                  {product.objects.map((object) => (
                    <div className="partRow" key={object.id}>
                      <div>
                        <strong>{object.name}</strong>
                        <span>{object.materials.join(", ") || "No material"}</span>
                      </div>
                      <label>
                        <ChevronDown size={14} />
                        <select value={object.group} onChange={(event) => updateObjectGroup(object.id, event.target.value as ClassifiedObject["group"])}>
                          {Object.entries(GROUP_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>

        <div className="enterpriseColumn">
          <section className="enterprisePanel">
            <div className="panelTitle">
              <Layers3 size={18} />
              <h2>Render Matrix</h2>
            </div>
            <div className="matrixGrid">
              <div>
                <p className="fieldLabel">Metal colors</p>
                <div className="optionGrid three">
                  {(Object.keys(metals) as EnterpriseMetal[]).map((metal) => (
                    <label className="checkTile" key={metal}>
                      <input checked={metals[metal]} type="checkbox" onChange={(event) => setMetals({ ...metals, [metal]: event.target.checked })} />
                      <span>{enterpriseMetalLabels[metal]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="fieldLabel">Angles</p>
                <div className="optionGrid two">
                  {(Object.keys(enterpriseAngles) as EnterpriseAngleKey[]).map((angle) => (
                    <label className="checkTile" key={angle}>
                      <input checked={angles[angle]} type="checkbox" onChange={(event) => setAngles({ ...angles, [angle]: event.target.checked })} />
                      <span>{enterpriseAngles[angle].label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="fieldLabel">Passes</p>
                <div className="optionGrid three">
                  {(["full", "metal", "stone"] as EnterprisePass[]).map((pass) => (
                    <label className="checkTile" key={pass}>
                      <input checked={passes[pass]} type="checkbox" onChange={(event) => setPasses({ ...passes, [pass]: event.target.checked })} />
                      <span>{pass === "full" ? "Full product" : pass === "metal" ? "Metal only" : "Stone focus"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="stoneGrid">
              {(Object.keys(stoneGroups) as Array<Exclude<EnterpriseGroupKey, "alloycolour">>).map((group) => (
                <div className="stoneRow" key={group}>
                  <label className="checkTile">
                    <input
                      checked={stoneGroups[group]}
                      type="checkbox"
                      onChange={(event) => setStoneGroups({ ...stoneGroups, [group]: event.target.checked })}
                    />
                    <span>{GROUP_LABELS[group]}</span>
                  </label>
                  <select
                    value={stoneMaterials[group]}
                    onChange={(event) => setStoneMaterials({ ...stoneMaterials, [group]: event.target.value as EnterpriseStoneMaterial })}
                  >
                    {(Object.keys(STONE_LABELS) as EnterpriseStoneMaterial[]).map((stone) => (
                      <option key={stone} value={stone}>
                        {STONE_LABELS[stone]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="renderSettings">
              <label>
                <span>Resolution</span>
                <input min={768} max={1800} step={100} type="number" value={resolution} onChange={(event) => setResolution(Number(event.target.value))} />
              </label>
              <label>
                <span>Samples</span>
                <input min={160} max={1200} step={40} type="number" value={samples} onChange={(event) => setSamples(Number(event.target.value))} />
              </label>
              <div className="plannedCount">
                <strong>{plannedRecipes.length}</strong>
                <span>jobs planned</span>
              </div>
            </div>

            <div className="actions">
              <button className="primary" disabled={!product || !plannedRecipes.length || busy} onClick={submitBatch}>
                {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                Render Batch
              </button>
              <button className="secondary" disabled={!product} onClick={() => navigator.clipboard.writeText(JSON.stringify(plannedRecipes[0] || {}, null, 2))}>
                <Sparkles size={18} />
                Copy First Recipe
              </button>
            </div>
            {message && <p className="message">{message}</p>}
          </section>

          <section className="enterprisePanel">
            <div className="panelTitle">
              <BadgeCheck size={18} />
              <h2>Live Production Results</h2>
            </div>
            {!productJobs.length && <p className="empty">Submitted production jobs will appear here in real time.</p>}
            <div className="resultGrid">
              {productJobs.map((job) => {
                const imageUrl = getJobImageUrl(job);
                const enterprise = recipeEnterprise(job);
                return (
                  <article className="resultCard" key={job.id}>
                    <div className="resultHead">
                      <strong>{recipeName(job)}</strong>
                      <span className={`liveStatus ${statusClass(job.status)}`}>
                        {statusIcon(job.status)}
                        {job.status}
                      </span>
                    </div>
                    {imageUrl ? (
                      <a href={imageUrl} target="_blank" rel="noreferrer">
                        <img alt={recipeName(job)} src={imageUrl} />
                      </a>
                    ) : (
                      <div className="renderPending">
                        <Clock size={22} />
                        <p>{job.status}</p>
                      </div>
                    )}
                    <div className="resultMeta">
                      <span>{typeof enterprise?.angle_label === "string" ? enterprise.angle_label : formatTime(job.createdAt)}</span>
                      {imageUrl && (
                        <a href={imageUrl} target="_blank" rel="noreferrer" title="Open render">
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>

      {completedJobs.length > 0 && (
        <section className="enterpriseGallery">
          {completedJobs.slice(0, 12).map((job) => (
            <a href={getJobImageUrl(job)} key={job.id} target="_blank" rel="noreferrer">
              <img alt={recipeName(job)} src={getJobImageUrl(job)} />
            </a>
          ))}
        </section>
      )}
    </main>
  );
}
