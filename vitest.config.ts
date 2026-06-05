import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Vitest harness for all later waves (Wave 0 per 01-VALIDATION.md).
// vite-tsconfig-paths resolves the `@/*` alias from tsconfig.json so tests
// import the same module specifiers as app code.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
