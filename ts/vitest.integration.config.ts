import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "test/core/integration/**/*.test.ts",
      "test/core/persistence/pg-*.test.ts",
    ],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "./coverage-integration",
      include: ["packages/core/src/persistence/**/*.ts"],
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
      "@pf/schema": "/packages/schema/src",
      "@pf/core": "/packages/core/src",
      "@pf/research": "/packages/research/src",
      "@pf/server": "/packages/server/src",
      "@pf/client": "/packages/client/src",
      "@pf/tui": "/packages/tui/src",
      "@app": "/src/app",
    },
  },
});
