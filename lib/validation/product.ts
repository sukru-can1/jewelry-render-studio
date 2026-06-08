import { z } from "zod";

// PROD-01/03 — V5 Input Validation. Every product-create and assignment-save
// payload is parsed here before any Prisma write. zod v3.25 per the STACK lock,
// mirroring lib/validation/user.ts.

// The four canonical render groups. Matches prisma ObjectGroup keys + the
// suggestGroup() output in lib/tokens.ts.
export const groupEnum = z.enum(["alloycolour", "diamond", "stone2", "stone3"]);

// Supported 3D model formats (lowercased extension, no dot).
export const modelFormatEnum = z.enum(["glb", "fbx", "blend", "obj", "stl"]);

// Create a product: a name and the PRIVATE blob pathname (not a public URL) of
// the uploaded model, plus its format.
export const createProductSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name"),
  modelPathname: z.string().trim().min(1, "Upload a model file"),
  modelFormat: modelFormatEnum,
});

// Save object→group assignments: one token list per group. objectTokens carry
// object signatures (consumed later as holdout `contains` tokens in Phase 3).
export const assignmentSchema = z.object({
  productId: z.string().min(1),
  groups: z.record(groupEnum, z.array(z.string())),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type ObjectGroupKey = z.infer<typeof groupEnum>;
export type ModelFormat = z.infer<typeof modelFormatEnum>;
