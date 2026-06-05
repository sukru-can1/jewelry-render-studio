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
      name: "v203a_close_front_hero",
      runpodJobId: "e8053fe9-4ea6-4b8b-bb1b-2ad4ed1573ac-e2",
    },
    {
      name: "v203b_close_catalog_left",
      runpodJobId: "41a16eb6-ea92-4811-b945-3e15bba8286c-e1",
    },
    {
      name: "v203c_close_catalog_right",
      runpodJobId: "d6d3fb3f-ecfc-43b7-99cf-c8c8e09123f8-e1",
    },
    {
      name: "v203d_close_low_side",
      runpodJobId: "b4e47d64-1e21-480a-a233-1aa6bf368e45-e2",
    },
    {
      name: "v203e_close_upper_ring_shape",
      runpodJobId: "da3666cd-a42d-4671-9177-ab43d4214986-e1",
    },
  ];

  const baseTime = Date.now();
  for (const [index, row] of rows.entries()) {
    const recipePath = `outputs/ring99/recipes/${row.name}.json`;
    const imageUrl = `https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/outputs/ring99/${row.name}/${row.name}.png`;
    const recipe = JSON.parse(await readFile(recipePath, "utf8"));
    const id = `manual-${recipe.name}-${randomUUID()}`;
    const timestamp = new Date(baseTime + index * 1000).toISOString();
    const outputPrefix = `outputs/ring99/${row.name}`;
    const job = {
      id,
      status: "COMPLETED",
      runpodJobId: row.runpodJobId,
      model,
      referenceImage: null,
      recipe,
      outputPrefix,
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
