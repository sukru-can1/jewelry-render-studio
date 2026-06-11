// Worker-code hosting sync guard.
//
// The RunPod worker boots by downloading its Python from the deployed app's
// /worker-code/*.py (template env HANDLER_PY_URL / RENDER_SCENE_PY_URL /
// POSTPROCESS_PY_URL). Those files are static copies of the canonical sources
// in workers/runpod-blender/ — this guard fails the suite the moment someone
// edits one side without re-copying, so the deployed worker can never silently
// drift from the repo's worker code.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FILES = ["handler.py", "render_scene.py", "postprocess.py", "inspect_materials.py"];

describe("public/worker-code mirrors workers/runpod-blender", () => {
  for (const file of FILES) {
    it(`${file} is byte-identical in both locations`, () => {
      const canonical = readFileSync(join(ROOT, "workers", "runpod-blender", file), "utf8");
      const served = readFileSync(join(ROOT, "public", "worker-code", file), "utf8");
      expect(served).toBe(canonical);
    });
  }
});
