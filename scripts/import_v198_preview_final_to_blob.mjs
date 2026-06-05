import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";

const JOB_PREFIX = "app-state/render-jobs";

function loadEnv(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1).trim().replace(/^"|"$/g, "");
    process.env[key] ||= value;
  }
}

async function main() {
  try {
    loadEnv(await readFile(".env", "utf8"));
  } catch {
    // Environment may already be present.
  }

  const recipePath = "outputs/ring99/recipes/v198_preview_smart_final_from_v198_preview_smart_facet_contrast_preview.json";
  const imageUrl =
    "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v198_preview_smart_final_from_preview/36692608-8d40-4887-9817-bd2cfbaa4eb7.png";
  const recipe = JSON.parse(await readFile(recipePath, "utf8"));
  const timestamp = new Date().toISOString();
  const id = `manual-${recipe.name}-${randomUUID()}`;
  const job = {
    id,
    status: "COMPLETED",
    runpodJobId: "fdc68ec8-22f6-4904-9870-112a70648a06-e1",
    model: {
      url: "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/son2.blend",
      pathname: "models/son2.blend",
      contentType: "application/octet-stream",
    },
    referenceImage: null,
    recipe,
    outputPrefix: "outputs/ring99/v198_preview_smart_final_from_preview",
    createdAt: timestamp,
    updatedAt: timestamp,
    result: {
      status: "COMPLETED",
      output: {
        image_url: imageUrl,
        image_blob: { url: imageUrl },
      },
    },
    error: null,
  };

  await put(`${JOB_PREFIX}/${id}.json`, JSON.stringify(job, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
  console.log(JSON.stringify({ imported: recipe.name, imageUrl }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
