import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/core/src/persistence/drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory",
  },
});
