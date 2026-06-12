import { z } from "zod";

// BATCH-06/07 — V5 Input Validation for the createBatch selection payload. The
// untrusted client selection crosses the Server-Action boundary here and is parsed
// BEFORE any count/cap logic or Prisma write (T-03-01). zod v3.25 idioms per the
// STACK lock, mirroring lib/validation/product.ts — do NOT use v4 idioms.

// The pass keys the operator may select. "full" is the primary beauty render —
// buildPasses ALWAYS emits it for every angle × metal combination, so selecting
// it explicitly is allowed but deduped (never two full jobs per combination).
// "metal" is the alloy compositing layer; "diamond"/"stone2"/"stone3" are the
// three stone-group compositing layers.
export const passEnum = z.enum(["full", "metal", "diamond", "stone2", "stone3"]);

// The stone-group keys whose passes carry a stone material (the alloy "metal" pass
// has no stone). Matches the non-alloy generator group keys.
export const stoneGroupEnum = z.enum(["diamond", "stone2", "stone3"]);

// Which recipe generator the batch renders through: "procedural" builds an
// empty scene from the recipe (buildEnterpriseRecipe); "master" renders inside
// the human-authored v203 studio .blend (buildMasterSceneRecipe) — the proven
// catalog-quality road. Matches lib/batches/expand.ts RenderPipeline.
export const pipelineEnum = z.enum(["procedural", "master"]);

// Array caps bound the payload so an attacker cannot inflate it into a runaway
// fan-out (anti-automation, V5). The server still recomputes the count against
// BATCH_LIMITS — these caps are an early, cheap rejection, not the authority.
export const createBatchSchema = z.object({
  productId: z.string().min(1),
  // One key per selected CameraView; resolved positionally via binding.viewKeyToAngle.
  angleViewKeys: z.array(z.string().min(1)).min(1).max(50),
  // One key per selected Metal; resolved via binding.resolveMetal (red -> rose).
  metalKeys: z.array(z.string().min(1)).min(1).max(10),
  // Per stone-group, the chosen StoneType.key (resolved via binding.resolveStoneMaterial).
  // A partial record is valid: only groups PRESENT on the product carry a stone type.
  stoneTypeByGroup: z.record(stoneGroupEnum, z.string().min(1)),
  // At least one pass; "metal" + the selected stone-group pass keys.
  passes: z.array(passEnum).min(1),
  qualityKey: z.string().min(1),
  // INTEL (Phase 9, G9): per-batch opt-in for the adaptive render loop. OPTIONAL,
  // defaults FALSE — the kill-switch stance: absent/off means the classic render
  // path, byte-for-byte. createBatch does NOT consume it yet (09-02 wires it);
  // this only lands the validated contract for the UI (09-03) + orchestration.
  optimizeWithAi: z.boolean().optional().default(false),
  // Recipe generator selection. OPTIONAL, defaults "procedural" so the server
  // contract stays byte-identical for pre-toggle clients; the batch-builder UI
  // sends "master" by default (the v203 studio pipeline — the quality road).
  pipeline: pipelineEnum.optional().default("procedural"),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// ADAPTER CONTRACT (consumed verbatim by Wave 1 / 03-02 expand + createBatch).
//
// This is the EXACT shape translation so the client's advisory estimate and the
// server's authoritative recompute agree (T-03-03). Both sides MUST derive the
// count the same way:
//
//   passCount = 1                                     (the IMPLICIT full beauty
//                                                      pass — always emitted; an
//                                                      explicit "full" is deduped)
//             + (passes includes "metal" ? 1 : 0)
//             + count(stone-group pass keys among passes that are PRESENT on the
//                     product, i.e. the product actually has that group assigned)
//
// Pass-key -> generator request fields:
//   (implicit / "full") -> { pass: "full" }                 (primary beauty render)
//   "metal"            -> { pass: "metal" }                 (alloy holdout, no stone)
//   "diamond" | "stone2" | "stone3"
//                      -> { pass: "stone", stoneGroup: <key> }
//
// Stone material per stone pass:
//   stoneTypeByGroup[stoneGroup] is a StoneType.key; feed it through
//   binding.resolveStoneMaterial() to get the EnterpriseStoneMaterial. A null
//   result (unsupported stone type) is REJECTED by the server — never silently
//   substituted (T-03-02).
//
// Angle/metal resolution:
//   angleViewKeys[i] -> binding.viewKeyToAngle(key, allViewKeys); a null (5th+ view)
//     is curated/skipped, not crashed.
//   metalKeys[i]     -> binding.resolveMetal(key); a null is rejected.
//
// Net: jobCount = |resolved angles| × |resolved metals| × |passCount| — stone TYPE
// never multiplies the count (BATCH-05); it only selects the material per stone pass.
// ─────────────────────────────────────────────────────────────────────────────
