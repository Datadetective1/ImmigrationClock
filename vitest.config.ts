import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // tsconfig sets jsx:"preserve" and leaves the transform to Next, so esbuild
  // here would otherwise fall back to the classic runtime and every rendered
  // component would throw "React is not defined". Needed to render a component
  // to markup in a test at all.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // These suites read the committed data snapshots (multi-MB JSON), so give
    // them room rather than letting a slow cold read look like a failure.
    testTimeout: 30_000,
  },
});
