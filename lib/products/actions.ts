"use server";

import { revalidatePath } from "next/cache";

import type { typeToFlattenedError } from "zod";

import { requireSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import {
  createProductSchema,
  type CreateProductInput,
} from "@/lib/validation/product";

// PROD-01 — createProduct Server Action. The entry point of the product
// workspace: an operator uploads a model directly to PRIVATE Blob, then this
// action persists the Product with the model's blob PATHNAME (never the URL) and
// a status of `needs_inspection`.
//
// T-02-05 (Spoofing): requireSession() is the FIRST line — fail-closed at the
// AUTH boundary. It throws a 401 Response for unauthenticated callers, which
// propagates so no product is created.
// T-02-06 (Info Disclosure): we store `modelPathname` into `modelUrl`; the
// caller passes the private blob PATHNAME, never the non-public URL.

type CreateProductResult =
  | { ok: true; id: string }
  | { ok: false; issues: typeToFlattenedError<CreateProductInput> };

export async function createProduct(
  input: unknown,
): Promise<CreateProductResult> {
  // AUTH BOUNDARY — fail closed before anything else (throws a 401 Response).
  await requireSession();

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.flatten() };
  }

  const { name, modelPathname, modelFormat } = parsed.data;

  const product = await prisma.product.create({
    data: {
      name,
      // Persist the PRIVATE blob pathname (delivered later via /api/file), never
      // the public URL — T-02-06.
      modelUrl: modelPathname,
      modelFormat,
      status: "needs_inspection",
    },
  });

  revalidatePath("/products");

  return { ok: true, id: product.id };
}
