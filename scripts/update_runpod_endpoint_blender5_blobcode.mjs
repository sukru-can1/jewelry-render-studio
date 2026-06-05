import { put } from "@vercel/blob";
import { readFile } from "fs/promises";

const RUNPOD_REST = "https://rest.runpod.io/v1";
const ENDPOINT_ID = "4lvi3w848rqy0l";
const IMAGE_NAME = "ghcr.io/sukru-can1/jewelry-render-worker:sha-fed328616e1f";
const BLENDER_URL = "https://download.blender.org/release/Blender5.0/blender-5.0.1-linux-x64.tar.xz";

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

async function runpod(method, path, payload) {
  const response = await fetch(`${RUNPOD_REST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`RunPod API error ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function uploadWorkerFile(localPath, remotePath) {
  const body = await readFile(localPath);
  const blob = await put(remotePath, body, {
    access: "public",
    contentType: "text/x-python",
    allowOverwrite: true,
  });
  return blob.url;
}

async function main() {
  try {
    loadEnv(await readFile(".env", "utf8"));
  } catch {
    // Environment may already be present.
  }
  if (!process.env.RUNPOD_API_KEY) throw new Error("RUNPOD_API_KEY is missing.");
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is missing.");

  const stamp = Date.now();
  const codeRoot = `worker-code/blender5-adaptive-${stamp}`;
  const handlerUrl = await uploadWorkerFile("workers/runpod-blender/handler.py", `${codeRoot}/handler.py`);
  const postprocessUrl = await uploadWorkerFile("workers/runpod-blender/postprocess.py", `${codeRoot}/postprocess.py`);
  const renderSceneUrl = await uploadWorkerFile("workers/runpod-blender/render_scene.py", `${codeRoot}/render_scene.py`);

  const startCmd = [
    "set -euo pipefail",
    `curl -L --retry 5 --retry-delay 3 '${BLENDER_URL}' -o /tmp/blender5.tar.xz`,
    "rm -rf /opt/blender5",
    "mkdir -p /opt/blender5",
    "tar -xf /tmp/blender5.tar.xz -C /opt/blender5 --strip-components=1",
    "ln -sf /opt/blender5/blender /usr/local/bin/blender",
    "python3 -m pip install --no-cache-dir Pillow==10.4.0",
    "curl -fsSL \"$HANDLER_PY_URL\" -o handler.py",
    "curl -fsSL \"$POSTPROCESS_PY_URL\" -o postprocess.py",
    "curl -fsSL \"$RENDER_SCENE_PY_URL\" -o render_scene.py",
    "python3 -u handler.py",
  ].join("; ");

  const template = await runpod("POST", "/templates", {
    name: `jewelry-render-blender-v028-blobcode-template-${stamp}`,
    imageName: IMAGE_NAME,
    category: "NVIDIA",
    containerDiskInGb: 50,
    dockerEntrypoint: [],
    dockerStartCmd: ["bash", "-lc", startCmd],
    env: {
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      BLOB_ACCESS: process.env.BLOB_ACCESS || "public",
      BLENDER_TIMEOUT_SECONDS: process.env.BLENDER_TIMEOUT_SECONDS || "1800",
      HANDLER_PY_URL: handlerUrl,
      POSTPROCESS_PY_URL: postprocessUrl,
      RENDER_SCENE_PY_URL: renderSceneUrl,
    },
    isPublic: false,
    isServerless: true,
    ports: [],
    readme: "Blender 5 runtime wrapper for Jewelry Render Studio. Worker code downloaded from Blob at startup.",
    volumeInGb: 0,
    volumeMountPath: "/workspace",
  });
  console.log(JSON.stringify({ templateId: template.id, handlerUrl, postprocessUrl, renderSceneUrl }, null, 2));

  await runpod("PATCH", `/endpoints/${ENDPOINT_ID}`, {
    workersMin: 0,
    workersMax: 0,
    idleTimeout: 1,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
  });
  await new Promise((resolve) => setTimeout(resolve, 20000));
  const endpoint = await runpod("PATCH", `/endpoints/${ENDPOINT_ID}`, {
    name: "jewelry-render-blender-v028-blobcode",
    templateId: template.id,
    gpuCount: 1,
    gpuTypeIds: ["NVIDIA GeForce RTX 4090"],
    workersMin: 1,
    workersMax: 2,
    idleTimeout: 5,
    executionTimeoutMs: 1800000,
    scalerType: "QUEUE_DELAY",
    scalerValue: 4,
  });
  console.log(JSON.stringify({ endpointId: endpoint.id, templateId: endpoint.templateId }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
