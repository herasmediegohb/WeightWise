import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classifyDbError, type DbProblem } from "./db-errors";

export function problemFrom(err: unknown): DbProblem {
  const attached = (err as { dbProblem?: DbProblem } | null)?.dbProblem;
  return attached ?? classifyDbError(err);
}

/** Connects and checks the app's tables exist. Never throws. */
export async function checkDatabase(): Promise<{ ok: true } | { ok: false; problem: DbProblem }> {
  try {
    const db = await getDb();
    await db.execute(sql`select 1 from profile limit 1`);
    return { ok: true };
  } catch (err) {
    console.error("[db-health]", err);
    return { ok: false, problem: problemFrom(err) };
  }
}
