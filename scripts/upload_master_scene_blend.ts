// Master-scene upload (one-off, re-runnable): pushes the proven v203 studio
// .blend (blend/son2.blend — see docs/MASTER_SCENE.md for the identification)
// into PRIVATE blob storage at master-scenes/v203-studio.blend.
//
// USAGE
//   npx tsx scripts/upload_master_scene_blend.ts
//
// Reads BLOB_READ_WRITE_TOKEN from .env (the file is UTF-8 with a BOM — the
// parser strips it; the legacy .mjs loadEnv helpers did not and would corrupt
// the FIRST key's name). allowOverwrite: re-runs replace the blob in place so
// the pathname stays stable for dispatch wiring.

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { putPrivate } from "../lib/blob";

const SOURCE = resolve(process.cwd(), "blend/son2.blend");
const PATHNAME = "master-scenes/v203-studio.blend";

function loadEnv(file: string) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return; // environment may already be present
  }
  // Strip the UTF-8 BOM BEFORE line parsing — otherwise the first key becomes
  // "﻿RUNPOD_API_KEY" and silently never matches.
  text = text.replace(/^﻿/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^"|"$/g, "");
    process.env[key] ||= value;
  }
}

async function main() {
  loadEnv(resolve(process.cwd(), ".env"));
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN missing (checked process env and .env)");
  }

  const bytes = statSync(SOURCE).size;
  console.log(`uploading ${SOURCE} (${bytes} bytes) -> private:${PATHNAME}`);
  const result = await putPrivate(PATHNAME, readFileSync(SOURCE), {
    contentType: "application/octet-stream",
    multipart: true,
    allowOverwrite: true,
  });
  console.log(JSON.stringify({ pathname: result.pathname, contentType: result.contentType }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
