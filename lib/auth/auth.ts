import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";

// Validate the login payload before any DB/bcrypt work (V5 input validation).
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * AUTH-01: Credentials authorize. Looks up the user by email, rejects missing
 * or disabled users, and bcrypt-compares the password. Returns a minimal user
 * (id/email/role) on success or `null` on any failure.
 *
 * Failure is always a generic `null` — never reveal whether the email or the
 * password was wrong (V2 / UI-SPEC: no user enumeration).
 *
 * Exported so the integration test (test/auth-login.test.ts) can drive it
 * directly with a mocked `prisma.user.findUnique`.
 */
export async function authorize(
  credentials: Partial<Record<"email" | "password", unknown>>,
): Promise<{ id: string; email: string; role: "Admin" | "Operator" } | null> {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabled) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, role: user.role };
}

// Node-runtime NextAuth instance: edge-safe config + the Credentials provider.
// `signOut` is wired (via pages.signIn) to land back on /login, clearing the
// session cookie on logout (AUTH-02).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize,
    }),
  ],
});
