import { createRequire } from "node:module";

import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Vitest harness for all later waves (Wave 0 per 01-VALIDATION.md).
// vite-tsconfig-paths resolves the `@/*` alias from tsconfig.json so tests
// import the same module specifiers as app code.
const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // next-auth imports the bare specifier `next/server`, which Vitest's
      // resolver fails to map to next's `server.js` export. Pin it to the real
      // file so importing the Node `lib/auth/auth.ts` (NextAuth instance) works
      // in tests. This does NOT affect edge-safety — middleware is asserted via
      // source-text in test/deny-default.test.ts.
      "next/server": require.resolve("next/server.js"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    server: {
      deps: {
        // Inline next-auth so Vite transforms its internal `next/server` import
        // and the alias above applies (otherwise Node's native ESM loader
        // resolves the bare specifier and fails to find next/server).
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
