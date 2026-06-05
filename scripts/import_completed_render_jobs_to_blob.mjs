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

  const model = {
    url: "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/son2.blend",
    pathname: "models/son2.blend",
    contentType: "application/octet-stream",
  };

  const rows = [
    {
      recipePath: "outputs/ring99/recipes/v188a_catalog_deeper_facets_clean_metal.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v188a_catalog_deeper_facets_clean_metal/v188a_catalog_deeper_facets_clean_metal.png",
      outputPrefix: "outputs/ring99/v188a_catalog_deeper_facets_clean_metal",
      runpodJobId: "07b41147-bf2a-4645-b240-fd9748403f89-e1",
    },
    {
      recipePath: "outputs/ring99/recipes/v188b_catalog_mild_facet_overlay.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v188b_catalog_mild_facet_overlay/v188b_catalog_mild_facet_overlay.png",
      outputPrefix: "outputs/ring99/v188b_catalog_mild_facet_overlay",
      runpodJobId: "694b7676-ee5f-495c-8ad4-c92b44b8e995-e1",
    },
    {
      recipePath: "outputs/ring99/recipes/v188c_upper_left_crisper_diamond.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v188c_upper_left_crisper_diamond/v188c_upper_left_crisper_diamond.png",
      outputPrefix: "outputs/ring99/v188c_upper_left_crisper_diamond",
      runpodJobId: "3cf6b84f-d2d3-40b4-8e34-eb4db61a81d5-e1",
    },
  ];

  const baseTime = Date.now();
  for (const [index, row] of rows.entries()) {
    const recipe = JSON.parse(await readFile(row.recipePath, "utf8"));
    const id = `manual-${recipe.name}-${randomUUID()}`;
    const timestamp = new Date(baseTime + index * 1000).toISOString();
    const job = {
      id,
      status: "COMPLETED",
      runpodJobId: row.runpodJobId,
      model,
      referenceImage: null,
      recipe,
      outputPrefix: row.outputPrefix,
      createdAt: timestamp,
      updatedAt: timestamp,
      result: {
        status: "COMPLETED",
        output: {
          image_url: row.imageUrl,
          image_blob: { url: row.imageUrl },
        },
      },
      error: null,
    };
    await put(`${JOB_PREFIX}/${id}.json`, JSON.stringify(job, null, 2), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    });
    console.log(JSON.stringify({ imported: recipe.name, imageUrl: row.imageUrl }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
