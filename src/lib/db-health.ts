import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classifyDbError, type DbProblem } from "./db-errors";

export function problemFrom(err: unknown): DbProblem {
  const attached = (err as { dbProblem?: DbProblem } | null)?.dbProblem;
  return attached ?? classifyDbError(err);
}

export type DbCheck =
  | { ok: true; firstMs: number; roundTripMs: number }
  | { ok: false; problem: DbProblem };

/**
 * Connects, checks the app's tables exist, and times it. `firstMs` includes
 * opening a connection when none is open; `roundTripMs` is the median of
 * three queries after that, i.e. the distance to the database. Never throws.
 */
export async function checkDatabase(): Promise<DbCheck> {
  try {
    const db = await getDb();
    let t = performance.now();
    await db.execute(sql`select 1 from profile limit 1`);
    const firstMs = performance.now() - t;
    const trips: number[] = [];
    for (let i = 0; i < 3; i++) {
      t = performance.now();
      await db.execute(sql`select 1`);
      trips.push(performance.now() - t);
    }
    trips.sort((a, b) => a - b);
    return { ok: true, firstMs: Math.round(firstMs), roundTripMs: Math.round(trips[1]) };
  } catch (err) {
    console.error("[db-health]", err);
    return { ok: false, problem: problemFrom(err) };
  }
}
