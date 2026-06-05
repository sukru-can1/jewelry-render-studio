import { createJob, listJobs, saveJob } from "@/lib/jobs";
import { submitRunPod } from "@/lib/runpod";
import type { BlobAsset, RenderJob } from "@/lib/types";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type Rating = {
  overall?: number;
  brightness?: number;
  diamond?: number;
  shadow?: number;
  reflection?: number;
  product?: number;
  verdict?: -1 | 0 | 1;
  note?: string;
};

type Candidate = {
  id: string;
  label: string;
  url: string;
  source?: string;
  jobId?: string;
};

type Body = {
  candidates?: Candidate[];
  ratings?: Record<string, Rating>;
  focus?: string[];
  winnerId?: string;
  winnerNote?: string;
};

const model: BlobAsset = {
  url: "https://u6oaq5xqg2yrxzlq.public.blob.vercel-storage.com/models/ring99.blend",
  pathname: "models/ring99.blend",
  contentType: "application/octet-stream",
};

function score(rating?: Rating) {
  if (!rating) return 0;
  return (
    (rating.overall || 0) * 3 +
    (rating.diamond || 0) * 2 +
    (rating.brightness || 0) +
    (rating.shadow || 0) +
    (rating.reflection || 0) +
    (rating.product || 0) * 1.5 +
    (rating.verdict || 0) * 2
  );
}

function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function light(recipe: Record<string, unknown>, name: string): Record<string, unknown> | null {
  const lights = Array.isArray(recipe.lights) ? recipe.lights : [];
  return (lights.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === name) as Record<string, unknown>) || null;
}

function card(recipe: Record<string, unknown>, name: string): Record<string, unknown> | null {
  const cards = Array.isArray(recipe.reflection_cards) ? recipe.reflection_cards : [];
  return (cards.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === name) as Record<string, unknown>) || null;
}

function setDiamond(recipe: Record<string, unknown>, patch: Record<string, unknown>) {
  const materialMap = Array.isArray(recipe.material_map) ? recipe.material_map : [];
  for (const item of materialMap) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const contains = Array.isArray(entry.contains) ? entry.contains.join(" ").toLowerCase() : "";
    if (!/(round_5|diamond|stone_emerald)/.test(contains)) continue;
    entry.source_material = "Diamond.001";
    entry.source_material_adjust = { ...((entry.source_material_adjust as Record<string, unknown>) || {}), ...patch };
  }
}

function multiplyLight(recipe: Record<string, unknown>, name: string, factor: number) {
  const entry = light(recipe, name);
  if (!entry || typeof entry.power !== "number") return;
  entry.power = Math.max(0, entry.power * factor);
}

function setLightPower(recipe: Record<string, unknown>, name: string, power: number) {
  const entry = light(recipe, name);
  if (!entry) return;
  entry.power = Math.max(0, Number(power.toFixed(3)));
}

function setCardColor(recipe: Record<string, unknown>, names: string[], value: number) {
  for (const name of names) {
    const entry = card(recipe, name);
    if (entry) entry.color = [value, value, value + 0.004, 1];
  }
}

function setBackground(recipe: Record<string, unknown>, value: number) {
  const background = record(recipe, "background");
  background.color = [value, value, value + 0.004, 1];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function loadBaseRecipe() {
  const file = path.join(process.cwd(), "outputs", "ring99", "recipes", "v144b_render_dark_reflectors_clean_table.json");
  return JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;
}

function getJobImageUrl(job: RenderJob) {
  const output = job.result && typeof job.result === "object" && "output" in job.result ? (job.result.output as Record<string, unknown>) : null;
  if (!output) return "";
  if (typeof output.image_url === "string") return output.image_url;
  const imageBlob = output.image_blob;
  if (imageBlob && typeof imageBlob === "object" && typeof (imageBlob as Record<string, unknown>).url === "string") {
    return (imageBlob as Record<string, unknown>).url as string;
  }
  return "";
}

async function findWinnerJob(chosen?: Candidate) {
  if (!chosen) return null;
  const jobs = await listJobs();
  if (chosen.jobId) {
    const byId = jobs.find((job) => job.id === chosen.jobId);
    if (byId) return byId;
  }
  return jobs.find((job) => getJobImageUrl(job) === chosen.url) || null;
}

function jitter(value: number, amount: number) {
  return Number((value + (Math.random() * 2 - 1) * amount).toFixed(4));
}

function setNumber(target: Record<string, unknown>, key: string, value: number, low: number, high: number) {
  target[key] = Math.max(low, Math.min(high, Number(value.toFixed(4))));
}

function buildRecipes(base: Record<string, unknown>, body: Body, baseSource: string) {
  const focus = new Set(body.focus || []);
  const rated = body.candidates || [];
  const chosen = body.winnerId
    ? rated.find((candidate) => candidate.id === body.winnerId)
    : rated
        .map((candidate) => ({ candidate, rating: body.ratings?.[candidate.id] }))
        .sort((a, b) => score(b.rating) - score(a.rating))[0]?.candidate;
  const bestRating = chosen ? body.ratings?.[chosen.id] : undefined;
  const note = [body.winnerNote, bestRating?.note].filter(Boolean).join(" ");
  const wantsDarker = focus.has("darker") || /too bright|bright|overexposed|white/i.test(note);
  const wantsBrighter = focus.has("brighter") || /too dark|dark/i.test(note);
  const wantsDiamond = focus.has("diamond") || (bestRating?.diamond || 0) < 4 || /diamond|stone|milky|fake|facet/i.test(note);
  const wantsShadow = focus.has("shadow") || (bestRating?.shadow || 0) < 4 || /shadow/i.test(note);
  const wantsReflection = focus.has("reflection") || (bestRating?.reflection || 0) < 4 || /reflection|black|metal|chrome/i.test(note);
  const generation = Date.now();

  const variants = [
    {
      suffix: "explore_dark_studio",
      exposure: wantsBrighter ? -0.035 : -0.095,
      world: wantsBrighter ? 0.05 : 0.022,
      background: 0.78,
      topPower: 275,
      fillPower: 2,
      rimPower: 210,
      pin1Power: 340,
      pin2Power: 295,
      lowerPinPower: 0,
      darkCards: 0.004,
      sideCard: 0.28,
      diamondValue: 0.38,
      diamondDensity: 0,
      centerContrast: 1.2,
      centerBrightness: 0.965,
      detail: 0.16,
    },
    {
      suffix: "explore_soft_photo",
      exposure: wantsDarker ? -0.045 : -0.018,
      world: 0.082,
      background: 0.845,
      topPower: 465,
      fillPower: 46,
      rimPower: 125,
      pin1Power: 185,
      pin2Power: 165,
      lowerPinPower: 6,
      darkCards: 0.052,
      sideCard: 0.50,
      diamondValue: 0.60,
      diamondDensity: 0.026,
      centerContrast: 1.07,
      centerBrightness: 0.998,
      detail: 0.055,
    },
    {
      suffix: "explore_diamond_fire",
      exposure: -0.06,
      world: 0.038,
      background: 0.82,
      topPower: 325,
      fillPower: 10,
      rimPower: 175,
      pin1Power: 430,
      pin2Power: 370,
      lowerPinPower: 2,
      darkCards: 0.012,
      sideCard: 0.36,
      diamondValue: 0.42,
      diamondDensity: 0.002,
      centerContrast: 1.22,
      centerBrightness: 0.972,
      detail: 0.18,
    },
    {
      suffix: "explore_clean_bright",
      exposure: wantsDarker ? -0.028 : 0.006,
      world: 0.105,
      background: 0.90,
      topPower: 540,
      fillPower: 68,
      rimPower: 105,
      pin1Power: 140,
      pin2Power: 125,
      lowerPinPower: 12,
      darkCards: 0.078,
      sideCard: 0.62,
      diamondValue: 0.68,
      diamondDensity: 0.038,
      centerContrast: 1.03,
      centerBrightness: 1.01,
      detail: 0.035,
    },
    {
      suffix: "explore_contact_shadow",
      exposure: -0.07,
      world: 0.048,
      background: 0.80,
      topPower: 360,
      fillPower: 0,
      rimPower: 155,
      pin1Power: 245,
      pin2Power: 220,
      lowerPinPower: 0,
      darkCards: 0.026,
      sideCard: 0.42,
      diamondValue: 0.50,
      diamondDensity: 0.012,
      centerContrast: 1.14,
      centerBrightness: 0.982,
      detail: 0.10,
    },
  ];

  return variants.map((variant, index) => {
    const recipe = clone(base);
    recipe.name = `v_rating_${generation}_${index + 1}_${variant.suffix}`;
    recipe.description = `Generated from UI tournament. Base: ${baseSource}. Winner: ${chosen?.label || "rated best"}. Focus: ${[...focus].join(", ") || "rating score"}. Notes: ${note || "none"}.`;

    const render = record(recipe, "render");
    const world = record(recipe, "world");
    setNumber(render, "exposure", jitter(variant.exposure, 0.006), -0.14, 0.035);
    render.samples = 300;
    setNumber(world, "strength", jitter(variant.world, 0.004), 0.012, 0.12);
    setBackground(recipe, jitter(variant.background, 0.01));

    setLightPower(recipe, "large_top_softbox", jitter(variant.topPower, 18));
    setLightPower(recipe, "lower_front_fill", jitter(variant.fillPower, 4));
    setLightPower(recipe, "right_rim_strip", jitter(variant.rimPower, 10));
    setLightPower(recipe, "diamond_sparkle_pin_1", jitter(variant.pin1Power, 18));
    setLightPower(recipe, "diamond_sparkle_pin_2", jitter(variant.pin2Power, 16));
    setLightPower(recipe, "lower_shadow_lift_pin", jitter(variant.lowerPinPower, 2));
    setCardColor(recipe, ["dark_lower_reflection", "dark_upper_facet_reflection", "front_low_black_reflection"], Math.max(0.004, jitter(variant.darkCards, 0.006)));
    setCardColor(recipe, ["soft_gray_side_reflection"], Math.max(0.2, jitter(variant.sideCard, 0.025)));

    const upperCard = card(recipe, "dark_upper_facet_reflection");
    if (upperCard && Array.isArray(upperCard.position)) {
      const pos = [...upperCard.position] as number[];
      pos[0] = jitter(pos[0] || 0, 0.18);
      pos[1] = jitter(pos[1] || -0.72, 0.08);
      upperCard.position = pos;
    }

    setDiamond(recipe, {
      glass_color_mix: 0,
      volume_color_mix: 0,
      volume_density_scale: Math.max(0, jitter(variant.diamondDensity, 0.003)),
      volume_density_max: Math.max(0, jitter(variant.diamondDensity, 0.003)),
      hsv_value_scale: Math.max(0.32, Math.min(0.74, jitter(variant.diamondValue, 0.018))),
      hsv_value_max: jitter(1.2, 0.025),
      saturation_scale: jitter(1.16, 0.035),
      diffuse_color: [0.7, 0.7, 0.7, 1],
    });
    const postprocess = record(recipe, "postprocess");
    const center = record(postprocess, "center_stone");
    center.contrast = jitter(variant.centerContrast, 0.014);
    center.brightness = jitter(variant.centerBrightness, 0.005);
    center.detail_amount = Math.max(0.02, jitter(variant.detail, 0.01));
    postprocess.diamond_facets = { enabled: false };
    recipe.facet_overlay = { enabled: false };
    return recipe;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const rated = body.candidates || [];
    const chosen = body.winnerId ? rated.find((candidate) => candidate.id === body.winnerId) : undefined;
    const winnerJob = await findWinnerJob(chosen);
    const fallbackBase = await loadBaseRecipe();
    const base = winnerJob?.recipe ? clone(winnerJob.recipe) : fallbackBase;
    const recipes = buildRecipes(base, body, winnerJob ? `winner job ${winnerJob.id}` : "fallback v144b");
    const jobs = [];

    for (const recipe of recipes) {
      const job = createJob({ model, recipe, referenceImage: null });
      const submitted = await submitRunPod({
        operation: "render",
        job_id: job.id,
        model: job.model,
        reference_image: job.referenceImage,
        recipe: job.recipe,
        output: {
          provider: "vercel_blob",
          prefix: job.outputPrefix,
          access: "public",
        },
      });
      job.runpodJobId = submitted.id || submitted.jobId;
      job.status = "submitted";
      job.result = { runpodSubmit: submitted, generatedFromRatings: body.focus || [] };
      jobs.push(await saveJob(job));
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rating sweep submit failed" }, { status: 500 });
  }
}
