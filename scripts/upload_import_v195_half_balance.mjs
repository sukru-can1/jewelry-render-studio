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

  const rows = [
    {
      name: "v195e_subtle_left_half_clear",
      file: "outputs/ring99/v195e_v193a_subtle_left_clear.png",
      pathname: "outputs/ring99/v195e_subtle_left_half_clear/v195e_subtle_left_half_clear.png",
    },
    {
      name: "v195f_medium_left_half_clear",
      file: "outputs/ring99/v195f_v193a_medium_left_clear.png",
      pathname: "outputs/ring99/v195f_medium_left_half_clear/v195f_medium_left_half_clear.png",
    },
  ];

  const model = {
    url: "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/son2.blend",
    pathname: "models/son2.blend",
    contentType: "application/octet-stream",
  };

  const baseRecipe = JSON.parse(await readFile("outputs/ring99/recipes/v193a_front_depth_oval_band.json", "utf8"));
  const baseTime = Date.now();

  for (const [index, row] of rows.entries()) {
    const image = await readFile(row.file);
    const blob = await put(row.pathname, image, {
      access: "public",
      contentType: "image/png",
      allowOverwrite: true,
    });

    const timestamp = new Date(baseTime + index * 1000).toISOString();
    const recipe = {
      ...baseRecipe,
      name: row.name,
      description: "Targeted postproduction half-stone correction from v193a to reduce one-sided milky reflection.",
      postprocess_note: "left half of center diamond selectively contrast-balanced; model/render unchanged",
    };
    const id = `manual-${row.name}-${randomUUID()}`;
    const job = {
      id,
      status: "COMPLETED",
      model,
      referenceImage: null,
      recipe,
      outputPrefix: row.pathname.split("/").slice(0, -1).join("/"),
      createdAt: timestamp,
      updatedAt: timestamp,
      result: {
        status: "COMPLETED",
        output: {
          image_url: blob.url,
          image_blob: { url: blob.url },
        },
      },
      error: null,
    };

    await put(`${JOB_PREFIX}/${id}.json`, JSON.stringify(job, null, 2), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    });

    console.log(JSON.stringify({ imported: row.name, imageUrl: blob.url }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
