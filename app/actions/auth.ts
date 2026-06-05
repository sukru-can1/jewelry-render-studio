"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth/auth";

/**
 * Result of a credentials sign-in attempt. The error is deliberately generic:
 * we NEVER reveal whether the email or the password was wrong (T-1-AUTH —
 * prevents user enumeration; UI-SPEC §2 generic error contract).
 */
export type SignInResult = { ok: true } | { ok: false; error: "invalid" };

/**
 * AUTH-01: Credentials sign-in server action.
 *
 * Wraps Auth.js `signIn("credentials", { redirect: false })` so the client form
 * controls the redirect (and shows a calm inline error on failure). On success
 * the form pushes the user to `from || "/products"`; this action only validates
 * the credentials and establishes the HTTP-only JWT cookie.
 */
export async function signInWithCredentials(
  formData: FormData,
): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirect: false });
    return { ok: true };
  } catch (error) {
    // CredentialsSignin (bad credentials) and any other AuthError collapse to a
    // single generic failure — the UI never surfaces which field was wrong.
    if (error instanceof AuthError) {
      return { ok: false, error: "invalid" };
    }
    // Re-throw non-auth errors (e.g. a Next.js redirect) so the framework can
    // handle them rather than masking them as a credential failure.
    throw error;
  }
}

/**
 * AUTH-02: Logout server action. Clears the session cookie and returns the user
 * to /login. Invoked from the user menu on every authenticated app page.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
