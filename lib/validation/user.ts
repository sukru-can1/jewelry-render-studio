import { z } from "zod";

// V5 Input Validation (RESEARCH): every admin user payload is parsed here BEFORE
// any Prisma write (T-1-INPUT mitigation). zod v3.25 per the STACK lock.

// Role is constrained to the Prisma Role enum values.
export const userRoleSchema = z.enum(["Admin", "Operator"]);

// Create: email must be a valid address, temporary password >= 8 chars, role
// in {Admin, Operator}. Email is normalized to a trimmed lowercase form so the
// unique constraint is not bypassed by case/whitespace.
export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Temporary password must be at least 8 characters"),
  role: userRoleSchema,
});

// Update: either toggle `disabled` or change `role` (or both); at least one
// field must be present so a PATCH is never a silent no-op.
export const updateUserSchema = z
  .object({
    role: userRoleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.disabled !== undefined, {
    message: "Provide a role or disabled flag to update",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AppRole = z.infer<typeof userRoleSchema>;
