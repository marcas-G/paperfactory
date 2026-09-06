import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    exclude: [
      "test/persistence/pg-object-store.test.ts",
      "test/persistence/pg-event-store.test.ts",
      "test/integration/database.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "clover"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/persistence/migrate.ts",
        "src/persistence/drizzle/**",
        "src/persistence/pg-object-store.ts",
        "src/persistence/pg-event-store.ts",
      ],
      thresholds: {
        lines: 88,
        branches: 75,
        functions: 85,
        statements: 88,
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
