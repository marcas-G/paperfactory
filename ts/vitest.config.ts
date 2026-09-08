import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    exclude: [
      "test/core/persistence/pg-object-store.test.ts",
      "test/core/persistence/pg-event-store.test.ts",
      "test/core/integration/database.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov", "clover"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "**/index.ts",
        "packages/core/src/persistence/migrate.ts",
        "packages/core/src/persistence/drizzle/**",
        "packages/core/src/persistence/pg-object-store.ts",
        "packages/core/src/persistence/pg-event-store.ts",
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
