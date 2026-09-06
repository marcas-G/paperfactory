import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "test/integration/**/*.test.ts",
      "test/persistence/pg-*.test.ts",
    ],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "./coverage-integration",
      include: ["src/persistence/**/*.ts"],
      thresholds: {
        lines: 50,
        branches: 50,
        functions: 40,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@domain": "/src/domain",
      "@cognition": "/src/cognition",
      "@persistence": "/src/persistence",
      "@control": "/src/control",
      "@runtime": "/src/runtime",
      "@orchestration": "/src/orchestration",
      "@api": "/src/api",
      "@app": "/src/app",
      "@observability": "/src/observability",
      "@evals": "/src/evals",
    },
  },
});
