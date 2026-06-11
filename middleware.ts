import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

// SEC-03 deny-by-default route gate. This runs on the Next.js EDGE runtime, so
// it imports ONLY the edge-safe auth.config.ts — never auth.ts/Prisma/bcrypt
// (RESEARCH Pitfall 1: importing Node modules here crashes the edge runtime).
// The `authorized` callback in auth.config.ts denies every request without a
// session except the matcher allowlist below.
export const { auth: middleware } = NextAuth(authConfig);

// Every route is gated EXCEPT: the Auth.js API (so users can sign in), /login,
// Next static assets, the favicon, the RunPod webhook, and the Vercel Cron
// routes (all machine-to-machine; authenticated by a shared secret inside their
// own handlers — SEC-04 / CRON_SECRET — so they must bypass the session gate or
// Vercel Cron would be redirected to /login and the orchestration would never run).
export const config = {
  matcher: [
    // worker-code: the RunPod worker boots by fetching its Python from
    // /worker-code/*.py (public static, replaces the legacy public-blob
    // hosting) — machine-to-machine, must bypass the session gate.
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|api/webhooks/runpod|api/cron|worker-code).*)",
  ],
};
