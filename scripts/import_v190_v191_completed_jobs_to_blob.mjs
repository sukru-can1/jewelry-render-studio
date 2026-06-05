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
      recipePath: "outputs/ring99/recipes/v190b_brighter_chrome_deep_stone.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v190b_brighter_chrome_deep_stone/v190b_brighter_chrome_deep_stone.png",
      outputPrefix: "outputs/ring99/v190b_brighter_chrome_deep_stone",
      runpodJobId: "395c229d-3464-458f-9f41-079d1e1d3969-e2",
    },
    {
      recipePath: "outputs/ring99/recipes/v191a_soft_floor_physical.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v191a_soft_floor_physical/v191a_soft_floor_physical.png",
      outputPrefix: "outputs/ring99/v191a_soft_floor_physical",
      runpodJobId: "804e7320-c5b5-4921-8e33-95929e50a89a-e2",
    },
    {
      recipePath: "outputs/ring99/recipes/v191c_crisper_less_halo.json",
      imageUrl:
        "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v191c_crisper_less_halo/v191c_crisper_less_halo.png",
      outputPrefix: "outputs/ring99/v191c_crisper_less_halo",
      runpodJobId: "bcd70667-51e2-482d-8032-c3646443c7dd-e2",
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
