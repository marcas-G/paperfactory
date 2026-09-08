import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as Schema from "./schema";

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    "postgresql://paperfactory:paperfactory_dev@localhost:5432/paperfactory";
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool());
  }
  return dbInstance;
}

export const db = {
  get: getDb,
  getPool,
  getDatabaseUrl,
  close: async () => {
    if (pool) {
      await pool.end();
      pool = null;
      dbInstance = null;
    }
  },
};

export { Schema };
