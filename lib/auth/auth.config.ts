import type { NextAuthConfig } from "next-auth";

// EDGE-SAFE Auth.js config (RESEARCH Pattern 1). This file is imported by
// middleware.ts which runs on the Next.js EDGE runtime — it MUST NOT import
// Prisma, bcrypt, or anything Node-only. The real Credentials provider (which
// needs Prisma + bcrypt) is added in lib/auth/auth.ts on the Node runtime.
//
// AUTH_SECRET is picked up automatically by Auth.js from the environment.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Real provider is added in auth.ts (Node). Empty here keeps the edge config
  // free of Prisma/bcrypt so middleware stays edge-safe.
  providers: [],
  callbacks: {
    // SEC-03 deny-by-default route gate. Public only when the path is /login;
    // everything else requires an authenticated session.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = nextUrl.pathname.startsWith("/login");
      if (isPublic) return true;
      return isLoggedIn;
    },
    // AUTH-03: carry the role from the authorized user into the JWT...
    jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    // ...and from the JWT into the session so server code reads session.user.role.
    session({ session, token }) {
      const role = token.role as "Admin" | "Operator" | undefined;
      if (role && session.user) {
        session.user.role = role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
