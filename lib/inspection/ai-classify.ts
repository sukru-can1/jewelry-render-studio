// AI-powered model analysis + auto-grouping (additive feature). Server-only: this
// module reads OPENAI_API_KEY and calls OpenAI — it must never run in the browser.
// It is imported solely by the Node-runtime route app/api/products/[id]/ai-analyze.
//
// Given the parsed inspection inventory (object names, material slots, BSDF
// values, sizes), ask an OpenAI reasoning model to classify each MESH object into
// one of the canonical render groups, diagnose scale anomalies, and explain its
// reasoning. The result is ALWAYS validated against the zod schema below before it
// is returned — the route then maps assignments back to object signatures and the
// operator reviews + Saves manually (never auto-saved).
//
// gpt-5.x are reasoning models and can be slow. We prefer the AI SDK's
// `generateObject` (provider-native structured output) and fall back to
// `generateText` + safe JSON.parse when structured output is unavailable or fails
// for this model — either way the output is re-validated with `aiAnalysisSchema`.

import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { env } from "@/lib/env";
import type { ParsedInventory } from "@/lib/inventory";

const DEFAULT_MODEL = "gpt-5.5-pro";

// The canonical render groups the operator assigns objects into (mirrors
// lib/validation/product groupEnum), plus "other" for non-jewelry/helper meshes
// the AI should NOT route into a render group (dropped during signature mapping).
export const aiGroupEnum = z.enum([
  "alloycolour",
  "diamond",
  "stone2",
  "stone3",
  "other",
]);

export const aiAnalysisSchema = z.object({
  assignments: z.array(
    z.object({
      name: z.string(),
      group: aiGroupEnum,
      reason: z.string(),
    }),
  ),
  scaleAnomalies: z.array(
    z.object({
      name: z.string(),
      note: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
  summary: z.string(),
});

export type AiGroup = z.infer<typeof aiGroupEnum>;
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

const SYSTEM_GUIDANCE = `You are a jewelry-rendering domain expert helping classify the MESH objects of a 3D jewelry model into render groups for layered catalog rendering.

Canonical groups (use EXACTLY these keys):
- "alloycolour" = the metal: band, shank, prongs, setting, rails, gallery — any structural metal part.
- "diamond" = the center / main stone (the single hero gemstone).
- "stone2" = side stones (the secondary stones flanking the center).
- "stone3" = accent / pavé / melee stones (the smallest scattered stones).
- "other" = non-jewelry or helper objects (cameras-as-mesh, planes, helpers, anything that is not a rendered jewelry part).

Classification signals:
- Metal materials are typically metallic ~1.0 with low-to-moderate roughness and no transmission.
- Stone/diamond materials are typically non-metallic with high transmission and high IOR (~1.5–2.5).
- Object name tokens help: band/shank/prong/setting/rail → alloycolour; center/main/solitaire → diamond; side → stone2; pave/melee/accent → stone3.

Scale guidance (IMPORTANT — avoid false alarms):
- A metal band being the LARGEST part of a ring is NORMAL. Do NOT flag it as an anomaly.
- Only flag a part whose size is anomalous RELATIVE TO ITS PEERS — e.g. one stone roughly 30x or more the size of its sibling stones, which usually means a unit/scale error in the model.
- Report each genuine anomaly in scaleAnomalies with a short, specific note.

Return concise, specific reasons per object. Put any general concerns (ambiguous parts, missing metal, everything unassigned, etc.) in warnings, and a one-paragraph human-readable overview in summary.`;

interface PromptObject {
  name: string;
  materialSlots: (string | null)[];
  maxDimension: number | null;
}

interface PromptMaterial {
  name: string;
  metallic: number | null;
  roughness: number | null;
  transmission: number | null;
  ior: number | null;
}

/**
 * Build the compact JSON payload (objects + materials) the model classifies.
 * Trimmed to the fields that carry classification signal so the prompt stays small.
 */
function buildPromptPayload(inventory: ParsedInventory): {
  objects: PromptObject[];
  materials: PromptMaterial[];
} {
  return {
    objects: inventory.objects.map((o) => ({
      name: o.name,
      materialSlots: o.materialSlots,
      maxDimension: o.maxDimension,
    })),
    materials: inventory.materials.map((m) => ({
      name: m.name,
      metallic: m.metallic,
      roughness: m.roughness,
      transmission: m.transmission,
      ior: m.ior,
    })),
  };
}

function buildUserPrompt(inventory: ParsedInventory): string {
  const payload = buildPromptPayload(inventory);
  return [
    "Classify the MESH objects of this jewelry model.",
    "",
    "Per object you are given: name, materialSlots (material names; null = empty slot), maxDimension (largest bounding-box dimension in scene units, or null).",
    "Per material you are given: name, metallic, roughness, transmission, ior (any may be null when the socket was absent).",
    "",
    "INVENTORY (JSON):",
    JSON.stringify(payload, null, 2),
    "",
    'Return ONE assignment per object (by its exact "name").',
  ].join("\n");
}

/**
 * Strip Markdown code fences and isolate the first {...} JSON object from a model
 * text response, then JSON.parse it. Used by the generateText fallback path.
 */
function safeParseJsonObject(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 && end > start
    ? fenced.slice(start, end + 1)
    : fenced;
  return JSON.parse(candidate);
}

/**
 * Classify an inspected inventory into render groups using OpenAI.
 *
 * - Reads the model from env.AI_MODEL (default "gpt-5.5-pro") and the key from
 *   env.OPENAI_API_KEY; throws a clear Error when the key is missing so the route
 *   can surface "AI is not configured" rather than failing opaquely.
 * - Prefers generateObject (validated structured output). If that throws (model
 *   doesn't support json-schema structured output, etc.) it falls back to
 *   generateText with a strict JSON instruction + safe parse.
 * - ALWAYS re-validates the result with aiAnalysisSchema before returning.
 */
export async function aiClassifyInventory(
  inventory: ParsedInventory,
): Promise<AiAnalysis> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI is not configured (OPENAI_API_KEY missing)");
  }
  const modelId = env.AI_MODEL ?? DEFAULT_MODEL;

  const openai = createOpenAI({ apiKey });
  const model = openai(modelId);
  const prompt = buildUserPrompt(inventory);

  // Generous headroom: reasoning models spend tokens on hidden reasoning before
  // emitting the structured answer.
  const maxOutputTokens = 8192;

  // Preferred path: provider-native structured output, validated by the SDK.
  try {
    const { object } = await generateObject({
      model,
      schema: aiAnalysisSchema,
      schemaName: "JewelryGroupAnalysis",
      system: SYSTEM_GUIDANCE,
      prompt,
      maxOutputTokens,
    });
    // generateObject validates against the schema, but re-parse defensively so
    // the contract is identical on both paths.
    return aiAnalysisSchema.parse(object);
  } catch (structuredError) {
    // Fallback: free-form text with a strict "return ONLY JSON" instruction, then
    // safe-parse + zod-validate. Keeps the feature working if structured output
    // is unsupported/flaky for this reasoning model.
    const { text } = await generateText({
      model,
      system: SYSTEM_GUIDANCE,
      prompt: [
        prompt,
        "",
        "Return ONLY a JSON object (no prose, no Markdown fences) matching EXACTLY this shape:",
        '{ "assignments": [{ "name": string, "group": "alloycolour"|"diamond"|"stone2"|"stone3"|"other", "reason": string }],',
        '  "scaleAnomalies": [{ "name": string, "note": string }],',
        '  "warnings": string[],',
        '  "summary": string }',
      ].join("\n"),
      maxOutputTokens,
    });

    let parsed: unknown;
    try {
      parsed = safeParseJsonObject(text);
    } catch {
      throw new Error(
        `AI analysis failed: structured output errored (${
          structuredError instanceof Error ? structuredError.message : "unknown"
        }) and the text fallback was not valid JSON.`,
      );
    }
    return aiAnalysisSchema.parse(parsed);
  }
}
