import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "."),
  // Next resolves "server-only" to an empty module on the server; tests run server code directly.
  "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/setup/integration.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
