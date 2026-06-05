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

  const recipePath = "outputs/ring99/recipes/v201_physical_cards_final_left_facet_break.json";
  const imageUrl =
    "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/v201_physical_cards_final_left_facet_break/dacb7b25-045c-46a9-8e8f-e2645904dbdf.png";
  const recipe = JSON.parse(await readFile(recipePath, "utf8"));
  const timestamp = new Date().toISOString();
  const id = `manual-${recipe.name}-${randomUUID()}`;
  const job = {
    id,
    status: "COMPLETED",
    runpodJobId: "56eaea83-ff7a-409b-b38b-a9928f043c67-e1",
    model: {
      url: "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/son2.blend",
      pathname: "models/son2.blend",
      contentType: "application/octet-stream",
    },
    referenceImage: null,
    recipe,
    outputPrefix: "outputs/ring99/v201_physical_cards_final_left_facet_break",
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
