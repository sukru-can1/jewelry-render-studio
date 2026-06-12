// INTEL-02 (Phase 9) — analyzePreview: the single schema-validated vision call.
// Mocks the AI SDK (`ai` + `@ai-sdk/openai`), @/lib/env, and the preview-image
// module (mirrors test/ai-classify.test.ts) so the real OpenAI API and blob/sharp
// are NEVER touched. Asserts:
//  - a valid generateObject result round-trips visionVerdictSchema;
//  - a generateObject THROW falls back to generateText + safe JSON parse + zod
//    re-validation (the ai-classify.ts fallback ladder);
//  - the image content part carries providerOptions.openai.imageDetail === "low"
//    and the PRIVATE preview data URL from previewDataUrl;
//  - the SYSTEM prompt encodes the 09-01 cardDarkness sign convention (a NEGATIVE
//    cardDarknessDelta darkens cards) + the milky forbidden-move iron law;
//  - a missing OPENAI_API_KEY throws a clear "not configured" error.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { visionVerdictSchema, type VisionVerdict } from "@/lib/intelligence/verdict";

// Toggle the key per test by mutating this object (env is read at call time).
const envMock = vi.hoisted(() => ({
  env: { OPENAI_API_KEY: "sk-test", AI_MODEL: "gpt-5.5-pro" } as {
    OPENAI_API_KEY?: string;
    AI_MODEL?: string;
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
    AI_VISION_MODEL?: string;
  },
}));
vi.mock("@/lib/env", () => envMock);

const generateObjectMock = vi.hoisted(() => vi.fn());
const generateTextMock = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({
  generateObject: (...a: unknown[]) => generateObjectMock(...a),
  generateText: (...a: unknown[]) => generateTextMock(...a),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (modelId: string) => ({ modelId, provider: "openai" }),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (modelId: string) => ({
    modelId,
    provider: "google",
  }),
}));

// Keep blob + sharp out of this suite entirely: the data URL is canned.
const previewDataUrlMock = vi.hoisted(() =>
  vi.fn(async (..._a: unknown[]) => "data:image/png;base64,Q0FOTkVE"),
);
vi.mock("@/lib/intelligence/preview-image", () => ({
  previewDataUrl: (...a: unknown[]) => previewDataUrlMock(...a),
}));

import { analyzePreview } from "@/lib/intelligence/analyze-preview";

const cannedVerdict: VisionVerdict = {
  scores: {
    diamondBrilliance: 4,
    metalHighlight: 4,
    metalBelievability: 5,
    exposureTonal: 4,
    stoneSymmetry: 4,
    contactShadow: 3,
    framing: 4,
    backgroundHoldout: 4,
  },
  flags: {
    milky: false,
    wrongMetal: false,
    brokenHoldout: false,
    blownHighlights: false,
    emptyOrBroken: false,
  },
  adjust: {
    worldStrengthDelta: 0,
    exposureDelta: 0,
    cardDarknessDelta: 0,
    contactShadowDelta: 0,
  },
  cameraPresetSuggestion: null,
  overallScore: 4,
  rationale: "Crisp facets, believable white gold, clean sweep.",
};

const context = { metal: "white", stoneGroup: "diamond", angle: "hero" };

type ContentPart = {
  type: string;
  text?: string;
  image?: string;
  providerOptions?: { openai?: { imageDetail?: string } };
};
type CallArg = {
  system?: string;
  messages?: { role: string; content: ContentPart[] }[];
};

beforeEach(() => {
  generateObjectMock.mockReset();
  generateTextMock.mockReset();
  previewDataUrlMock.mockClear();
  envMock.env.OPENAI_API_KEY = "sk-test";
  envMock.env.AI_MODEL = "gpt-5.5-pro";
  envMock.env.GOOGLE_GENERATIVE_AI_API_KEY = undefined;
  envMock.env.AI_VISION_MODEL = undefined;
});

describe("analyzePreview — structured vision call (INTEL-02)", () => {
  it("validates and returns the generateObject verdict (no fallback)", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    const verdict = await analyzePreview("renders/job-1/preview.png", context);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(() => visionVerdictSchema.parse(verdict)).not.toThrow();
    expect(verdict.overallScore).toBe(4);
    expect(previewDataUrlMock).toHaveBeenCalledWith("renders/job-1/preview.png");
  });

  it("sends the image content part with imageDetail:'low' + the private data URL", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    await analyzePreview("renders/job-1/preview.png", context);

    const call = generateObjectMock.mock.calls[0][0] as CallArg;
    const content = call.messages?.[0]?.content ?? [];
    const imagePart = content.find((p) => p.type === "image");
    expect(imagePart).toBeTruthy();
    expect(imagePart?.image).toBe("data:image/png;base64,Q0FOTkVE");
    expect(imagePart?.providerOptions?.openai?.imageDetail).toBe("low");
    // The render context travels as the text part.
    const textPart = content.find((p) => p.type === "text");
    expect(textPart?.text).toContain("metal=white");
    expect(textPart?.text).toContain("angle=hero");
  });

  it("SYSTEM prompt encodes the cardDarkness sign convention + the milky iron law", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    await analyzePreview("renders/job-1/preview.png", context);

    const call = generateObjectMock.mock.calls[0][0] as CallArg;
    const system = call.system ?? "";
    // 09-01 carry-over: the knob is a brightness multiplier — a NEGATIVE delta
    // DARKENS the reflection cards (09-AI-SPEC §5.3's sign table is wrong here).
    expect(system).toMatch(/NEGATIVE cardDarknessDelta/i);
    expect(system).toMatch(/darker|darkens/i);
    // The DOMAIN iron law: never raise exposure/world to "fix" milkiness.
    expect(system).toMatch(/milky/i);
    expect(system).toMatch(/NEVER propose a positive exposureDelta/i);
  });

  it("falls back to generateText + safe JSON parse when generateObject throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("structured output unsupported"));
    generateTextMock.mockResolvedValueOnce({
      text: "```json\n" + JSON.stringify(cannedVerdict) + "\n```",
    });

    const verdict = await analyzePreview("renders/job-1/preview.png", context);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(() => visionVerdictSchema.parse(verdict)).not.toThrow();
    expect(verdict.scores.metalBelievability).toBe(5);
  });

  it("re-validates the fallback against visionVerdictSchema (G1 — bad shape rejected)", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("structured output unsupported"));
    // Parsable JSON, but NOT a valid verdict — zod must reject it.
    generateTextMock.mockResolvedValueOnce({ text: '{ "overallScore": 99 }' });

    await expect(
      analyzePreview("renders/job-1/preview.png", context),
    ).rejects.toThrow();
  });

  it("throws when both structured output and the text fallback are unusable", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("structured output unsupported"));
    generateTextMock.mockResolvedValueOnce({ text: "I cannot grade that." });

    await expect(
      analyzePreview("renders/job-1/preview.png", context),
    ).rejects.toThrow(/vision analysis failed/i);
  });

  it("throws a clear 'not configured' error when NO vision key is present", async () => {
    envMock.env.OPENAI_API_KEY = undefined;
    envMock.env.GOOGLE_GENERATIVE_AI_API_KEY = undefined;
    await expect(
      analyzePreview("renders/job-1/preview.png", context),
    ).rejects.toThrow(/not configured/);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(previewDataUrlMock).not.toHaveBeenCalled();
  });
});

describe("vision judge selection — Gemini latest preferred (user directive)", () => {
  it("uses gemini-flash-latest when GOOGLE_GENERATIVE_AI_API_KEY is set (even with an OpenAI key)", async () => {
    envMock.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-test";
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    await analyzePreview("renders/job-1/preview.png", context);

    const call = generateObjectMock.mock.calls[0][0] as CallArg & {
      model?: { modelId?: string; provider?: string };
    };
    expect(call.model?.provider).toBe("google");
    expect(call.model?.modelId).toBe("gemini-flash-latest");
  });

  it("AI_VISION_MODEL pins the Gemini model id", async () => {
    envMock.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-test";
    envMock.env.AI_VISION_MODEL = "gemini-3.5-flash";
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    await analyzePreview("renders/job-1/preview.png", context);

    const call = generateObjectMock.mock.calls[0][0] as CallArg & {
      model?: { modelId?: string };
    };
    expect(call.model?.modelId).toBe("gemini-3.5-flash");
  });

  it("falls back to the OpenAI judge when only OPENAI_API_KEY is present", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    await analyzePreview("renders/job-1/preview.png", context);

    const call = generateObjectMock.mock.calls[0][0] as CallArg & {
      model?: { modelId?: string; provider?: string };
    };
    expect(call.model?.provider).toBe("openai");
    expect(call.model?.modelId).toBe("gpt-5.5-pro");
  });

  it("Gemini-only deployment works (no OpenAI key at all)", async () => {
    envMock.env.OPENAI_API_KEY = undefined;
    envMock.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-test";
    generateObjectMock.mockResolvedValueOnce({ object: cannedVerdict });

    const verdict = await analyzePreview("renders/job-1/preview.png", context);
    expect(verdict.overallScore).toBe(4);
  });
});
