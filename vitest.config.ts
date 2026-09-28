import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit scope: engine and state only. Browser behaviour belongs to the Playwright suite.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/property/**/*.test.ts"],
    reporters: ["default"],
  },
});
