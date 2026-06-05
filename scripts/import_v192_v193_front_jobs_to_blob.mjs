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
      recipePath: "outputs/ring99/recipes/v192b_straight_front_clean_metal.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v192b_straight_front_clean_metal/v192b_straight_front_clean_metal.png",
      outputPrefix: "outputs/ring99/v192b_straight_front_clean_metal",
      runpodJobId: "43183494-2c02-4503-8387-459465065212-e2",
    },
    {
      recipePath: "outputs/ring99/recipes/v193a_front_depth_oval_band.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v193a_front_depth_oval_band/v193a_front_depth_oval_band.png",
      outputPrefix: "outputs/ring99/v193a_front_depth_oval_band",
      runpodJobId: "78e3099e-e24b-489a-92d3-827e8135f792-e2",
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
