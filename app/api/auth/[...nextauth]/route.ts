// Auth.js v5 catch-all route handler. Re-exports the GET/POST handlers produced
// by NextAuth() in lib/auth/auth.ts. This is the only auth API surface; it is
// allowlisted in middleware (SEC-03) so unauthenticated users can sign in.
import { handlers } from "@/lib/auth/auth";

export const { GET, POST } = handlers;
