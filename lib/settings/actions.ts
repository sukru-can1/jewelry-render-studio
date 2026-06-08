"use server";

import { revalidatePath } from "next/cache";

import type { typeToFlattenedError } from "zod";
import type { Prisma } from "@prisma/client";

import { requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import {
  cameraViewSchema,
  metalSchema,
  qualityPresetSchema,
  stoneTypeSchema,
  type CameraViewInput,
  type MetalInput,
  type QualityPresetInput,
  type StoneTypeInput,
} from "@/lib/validation/settings";

// DATA-04 — domain-settings Server Actions. Each save action is the AUTHORITATIVE
// server boundary (AUTH-05 / T-02-09): requireRole("Admin") is the FIRST line of
// every action, defense-in-depth on top of the page redirect — UI hiding is NOT
// the boundary. An Operator's 403 Response is caught and mapped to a returned
// { ok:false, forbidden:true } so the action fails closed with no write.
//
// T-02-10 (Tampering): every row is zod-validated (focal/fstop/el/az ranges,
// 6-digit hex, positive ints) BEFORE any write; on any issue we return the
// collected issues and write nothing.
//
// Pitfall 7: changes apply to NEW batches only — we upsert the domain tables and
// never retroactively rewrite existing Job/Batch recipes.

type SaveResult<T> =
  | { ok: true }
  | { ok: false; forbidden: true }
  | { ok: false; issues: typeToFlattenedError<T> };

// requireRole throws a `Response` (401/403) when the gate fails. Translate a 403
// into a fail-closed { forbidden:true } and re-throw anything else.
function deniedToForbidden(err: unknown): { ok: false; forbidden: true } {
  if (err instanceof Response && (err.status === 403 || err.status === 401)) {
    return { ok: false, forbidden: true };
  }
  throw err;
}

// Validate every row against `schema`; on the FIRST failure return the flattened
// issues (so the UI surfaces the UI-SPEC copy), else return the parsed rows.
function validateRows<T>(
  rows: unknown,
  schema: {
    safeParse: (v: unknown) => { success: boolean } & Record<string, unknown>;
  },
):
  | { ok: true; data: T[] }
  | { ok: false; issues: typeToFlattenedError<T> } {
  const list = Array.isArray(rows) ? rows : [];
  const parsed: T[] = [];
  for (const row of list) {
    const result = schema.safeParse(row) as
      | { success: true; data: T }
      | { success: false; error: { flatten: () => typeToFlattenedError<T> } };
    if (!result.success) {
      return { ok: false, issues: result.error.flatten() };
    }
    parsed.push(result.data);
  }
  return { ok: true, data: parsed };
}

export async function saveCameraViews(
  input: unknown,
): Promise<SaveResult<CameraViewInput>> {
  try {
    await requireRole("Admin");
  } catch (err) {
    return deniedToForbidden(err);
  }

  const validated = validateRows<CameraViewInput>(input, cameraViewSchema);
  if (!validated.ok) return { ok: false, issues: validated.issues };

  await prisma.$transaction(
    validated.data.map((v) =>
      prisma.cameraView.upsert({
        where: { key: v.key },
        update: {
          label: v.label,
          azimuth: v.azimuth,
          elevation: v.elevation,
          focalMm: v.focalMm,
          fStop: v.fStop,
        },
        create: {
          key: v.key,
          label: v.label,
          azimuth: v.azimuth,
          elevation: v.elevation,
          focalMm: v.focalMm,
          fStop: v.fStop,
        },
      }),
    ),
  );

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function saveMetals(
  input: unknown,
): Promise<SaveResult<MetalInput>> {
  try {
    await requireRole("Admin");
  } catch (err) {
    return deniedToForbidden(err);
  }

  const validated = validateRows<MetalInput>(input, metalSchema);
  if (!validated.ok) return { ok: false, issues: validated.issues };

  await prisma.$transaction(
    validated.data.map((m) =>
      prisma.metal.upsert({
        where: { key: m.key },
        update: { label: m.label, hex: m.hex },
        create: { key: m.key, label: m.label, hex: m.hex },
      }),
    ),
  );

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function saveQualityPresets(
  input: unknown,
): Promise<SaveResult<QualityPresetInput>> {
  try {
    await requireRole("Admin");
  } catch (err) {
    return deniedToForbidden(err);
  }

  const validated = validateRows<QualityPresetInput>(input, qualityPresetSchema);
  if (!validated.ok) return { ok: false, issues: validated.issues };

  await prisma.$transaction(
    validated.data.map((q) =>
      prisma.qualityPreset.upsert({
        where: { key: q.key },
        update: {
          label: q.label,
          samples: q.samples,
          width: q.width,
          height: q.height,
        },
        create: {
          key: q.key,
          label: q.label,
          samples: q.samples,
          width: q.width,
          height: q.height,
        },
      }),
    ),
  );

  revalidatePath("/admin/settings");
  return { ok: true };
}

// StoneType is an editable LIST: upsert every provided row by key, and delete any
// row whose key is NOT in the payload (the editor can remove rows). Both happen
// inside a single $transaction so the catalog never lands half-applied.
export async function saveStoneTypes(
  input: unknown,
): Promise<SaveResult<StoneTypeInput>> {
  try {
    await requireRole("Admin");
  } catch (err) {
    return deniedToForbidden(err);
  }

  const validated = validateRows<StoneTypeInput>(input, stoneTypeSchema);
  if (!validated.ok) return { ok: false, issues: validated.issues };

  const keys = validated.data.map((s) => s.key);

  await prisma.$transaction(async (tx) => {
    // Remove rows the editor dropped (keys not present in the payload).
    await tx.stoneType.deleteMany({ where: { key: { notIn: keys } } });
    for (const s of validated.data) {
      // Prisma's Json input type is stricter than Record<string, unknown>;
      // cast the validated open-ended preset to its accepted input shape.
      const preset = (s.preset ?? undefined) as
        | Prisma.InputJsonValue
        | undefined;
      await tx.stoneType.upsert({
        where: { key: s.key },
        update: { label: s.label, preset },
        create: { key: s.key, label: s.label, preset },
      });
    }
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
