// Module augmentation so `role` is typed on the session user and the JWT
// (AUTH-03). The jwt callback copies `user.role` onto `token.role`; the session
// callback copies it onto `session.user.role`. These augmentations make both
// sides type-safe instead of relying on `as any` casts at the call sites.
import type { DefaultSession } from "next-auth";

type AppRole = "Admin" | "Operator";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
    } & DefaultSession["user"];
  }

  interface User {
    role: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
  }
}
