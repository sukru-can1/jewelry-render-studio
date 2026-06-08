import { z } from "zod";

// DATA-04 — V5 Input Validation for Admin domain-settings edits. Error messages
// match the UI-SPEC copy contract so the surfaced text is exactly what the spec
// prescribes. zod v3.25 per the STACK lock.

export const cameraViewSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  azimuth: z.number().min(-180).max(180),
  elevation: z.number().min(-90).max(90),
  focalMm: z.number().positive("Focal must be greater than 0."),
  fStop: z
    .number()
    .min(0.7, "Use an f-stop between 0.7 and 32.")
    .max(32, "Use an f-stop between 0.7 and 32."),
});

export const metalSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex like #C9A227."),
});

export const stoneTypeSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  preset: z.record(z.string(), z.unknown()).optional(),
});

export const qualityPresetSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  samples: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type CameraViewInput = z.infer<typeof cameraViewSchema>;
export type MetalInput = z.infer<typeof metalSchema>;
export type StoneTypeInput = z.infer<typeof stoneTypeSchema>;
export type QualityPresetInput = z.infer<typeof qualityPresetSchema>;
