import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These suites read the committed data snapshots (multi-MB JSON), so give
    // them room rather than letting a slow cold read look like a failure.
    testTimeout: 30_000,
  },
});
