import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { checkConnectionString, pgConnectionOptions } from "@/lib/db-errors";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __wwDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const problem = checkConnectionString(url);
    if (problem) throw Object.assign(new Error(problem.title), { dbProblem: problem });
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      ...pgConnectionOptions(url),
      max: 3,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      // A query that hangs becomes an error with an explanation instead of
      // a page that spins until Vercel's gateway timeout.
      query_timeout: 15_000,
    });
    // Errors on idle connections (e.g. the pooler closing them) must not
    // crash the function; the next query opens a fresh connection.
    pool.on("error", (err) => console.error("[db pool]", err.message));
    if (process.env.VERCEL) {
      // Closes idle connections before Vercel suspends the function, so a
      // resumed function never reuses a dead socket.
      const { attachDatabasePool } = await import("@vercel/functions");
      attachDatabasePool(pool);
    }
    return drizzle(pool, { schema }) as unknown as DB;
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
