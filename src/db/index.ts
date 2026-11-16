import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { checkConnectionString, sslFor } from "@/lib/db-errors";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __wwDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Hosted Postgres (Supabase / Neon). `prepare: false` keeps this
    // compatible with transaction-mode connection poolers.
    const problem = checkConnectionString(url);
    if (problem) throw Object.assign(new Error(problem.title), { dbProblem: problem });
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, {
      prepare: false,
      max: 1,
      ssl: sslFor(url),
      connect_timeout: 10,
    });
    return drizzle(client, { schema }) as unknown as DB;
  }
  if (process.env.VERCEL) {
    const problem = checkConnectionString(undefined)!;
    throw Object.assign(new Error(problem.title), { dbProblem: problem });
  }
  // Local development: embedded Postgres stored in ./.data, no setup needed.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const fs = await import("node:fs");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalForDb.__wwDb) {
    globalForDb.__wwDb = connect().catch((err) => {
      globalForDb.__wwDb = undefined;
      throw err;
    });
  }
  return globalForDb.__wwDb;
}

export { schema };
