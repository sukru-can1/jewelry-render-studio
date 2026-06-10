// AI auto-grouping (additive). Mocks the AI SDK (`ai` + `@ai-sdk/openai`) so the
// real OpenAI API is NEVER called, and mocks `@/lib/env` so the OPENAI_API_KEY can
// be toggled per test. Asserts:
//  - aiClassifyInventory validates + returns a canned generateObject result;
//  - it throws the clear "AI is not configured" error when OPENAI_API_KEY absent;
//  - the route maps AI assignments → groupsBySignature, matching object names to
//    signatures and DROPPING "other".
import { beforeEach, describe, expect, it, vi } from "vitest";

// Toggle the key per test by mutating this object (env is read at call time).
const envMock = vi.hoisted(() => ({
  env: { OPENAI_API_KEY: "sk-test", AI_MODEL: "gpt-5.5-pro" } as {
    OPENAI_API_KEY?: string;
    AI_MODEL?: string;
  },
}));
vi.mock("@/lib/env", () => envMock);

// Mock the AI SDK: createOpenAI returns a provider fn; generateObject/generateText
// are spies the tests drive. Never touches the network.
const generateObjectMock = vi.hoisted(() => vi.fn());
const generateTextMock = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({
  generateObject: (...a: unknown[]) => generateObjectMock(...a),
  generateText: (...a: unknown[]) => generateTextMock(...a),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (modelId: string) => ({ modelId }),
}));

import {
  aiClassifyInventory,
  aiAnalysisSchema,
  type AiAnalysis,
} from "@/lib/inspection/ai-classify";
import type { ParsedInventory } from "@/lib/inventory";

const inventory: ParsedInventory = {
  source: "/tmp/ring.glb",
  objects: [
    {
      name: "band_metal",
      type: "MESH",
      materialSlots: ["Gold"],
      maxDimension: 10,
      signature: "band_metal gold",
    },
    {
      name: "center_diamond",
      type: "MESH",
      materialSlots: ["Glass"],
      maxDimension: 2,
      signature: "center_diamond glass",
    },
    {
      name: "helper_plane",
      type: "MESH",
      materialSlots: [null],
      maxDimension: 50,
      signature: "helper_plane",
    },
  ],
  materials: [
    { name: "Gold", baseColor: null, metallic: 1, roughness: 0.2, transmission: 0, ior: 1.45 },
    { name: "Glass", baseColor: null, metallic: 0, roughness: 0, transmission: 1, ior: 2.417 },
  ],
};

const cannedAnalysis: AiAnalysis = {
  assignments: [
    { name: "band_metal", group: "alloycolour", reason: "Metallic ~1.0, structural band." },
    { name: "center_diamond", group: "diamond", reason: "High transmission + IOR; the hero stone." },
    { name: "helper_plane", group: "other", reason: "Unshaded helper plane, not a jewelry part." },
  ],
  scaleAnomalies: [],
  warnings: [],
  summary: "Standard solitaire: one metal band and one center diamond.",
};

beforeEach(() => {
  generateObjectMock.mockReset();
  generateTextMock.mockReset();
  envMock.env.OPENAI_API_KEY = "sk-test";
  envMock.env.AI_MODEL = "gpt-5.5-pro";
});

describe("aiClassifyInventory", () => {
  it("validates and returns the structured generateObject result", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: cannedAnalysis });

    const result = await aiClassifyInventory(inventory);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    // Schema-valid round-trip.
    expect(() => aiAnalysisSchema.parse(result)).not.toThrow();
    expect(result.assignments).toHaveLength(3);
    expect(result.summary).toContain("solitaire");
  });

  it("throws a clear error when OPENAI_API_KEY is absent", async () => {
    envMock.env.OPENAI_API_KEY = undefined;
    await expect(aiClassifyInventory(inventory)).rejects.toThrow(
      "AI is not configured (OPENAI_API_KEY missing)",
    );
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("falls back to generateText + safe JSON parse when generateObject throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("structured output unsupported"));
    // Returns the JSON wrapped in a Markdown fence to exercise the fence stripper.
    generateTextMock.mockResolvedValueOnce({
      text: "```json\n" + JSON.stringify(cannedAnalysis) + "\n```",
    });

    const result = await aiClassifyInventory(inventory);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.assignments).toHaveLength(3);
    expect(result.assignments[0]?.group).toBe("alloycolour");
  });

  it("throws when both structured output and the text fallback are unusable", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("structured output unsupported"));
    generateTextMock.mockResolvedValueOnce({ text: "I cannot answer that." });
    await expect(aiClassifyInventory(inventory)).rejects.toThrow(/AI analysis failed/);
  });
});

describe("AI assignments → groupsBySignature mapping", () => {
  // Mirrors the route's mapping: match by object name → signature, drop "other".
  function mapToSignatures(
    objects: ParsedInventory["objects"],
    assignments: AiAnalysis["assignments"],
  ): Record<string, string> {
    const byName = new Map(objects.map((o) => [o.name, o]));
    const out: Record<string, string> = {};
    for (const a of assignments) {
      if (a.group === "other") continue;
      const obj = byName.get(a.name);
      if (!obj) continue;
      out[obj.signature] = a.group;
    }
    return out;
  }

  it("matches names to signatures and drops 'other'", () => {
    const groups = mapToSignatures(inventory.objects, cannedAnalysis.assignments);
    expect(groups).toEqual({
      "band_metal gold": "alloycolour",
      "center_diamond glass": "diamond",
    });
    // helper_plane was "other" → not present.
    expect(groups).not.toHaveProperty("helper_plane");
  });

  it("ignores assignments whose name has no matching object", () => {
    const groups = mapToSignatures(inventory.objects, [
      { name: "ghost_object", group: "stone2", reason: "phantom" },
      { name: "band_metal", group: "alloycolour", reason: "ok" },
    ]);
    expect(groups).toEqual({ "band_metal gold": "alloycolour" });
  });
});
