import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // The repo's own scripts keep their tests beside them (scripts/new-env.test.mjs).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    // Component tests opt into the DOM per file with `// @vitest-environment jsdom`.
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**"],
      exclude: ["**/*.test.ts", "**/__fixtures__/**"],
    },
  },
});
