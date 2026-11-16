import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Token the database scheduler sends with each tick. Derived from the app's
 * secret, so no extra environment variable is needed. Changing APP_PASSWORD
 * (or AUTH_SECRET) changes it; setting the scheduler up again fixes that.
 */
export function tickToken(): string | null {
  const secret = process.env.AUTH_SECRET || (process.env.APP_PASSWORD ? `ww:${process.env.APP_PASSWORD}` : "");
  if (!secret) return null;
  return createHmac("sha256", secret).update("weightwise-scheduler-tick").digest("hex");
}

export function tickAuthorized(header: string | null): boolean {
  const presented = header?.replace(/^Bearer\s+/i, "") ?? "";
  const accepted = [tickToken(), process.env.CRON_SECRET].filter(Boolean) as string[];
  return accepted.some((t) => {
    const a = Buffer.from(t);
    const b = Buffer.from(presented);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function recordTick(): Promise<void> {
  const db = await getDb();
  const value = { at: new Date().toISOString() };
  await db
    .insert(schema.appState)
    .values({ key: "scheduler", value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });
}

export async function lastTick(): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, "scheduler")).limit(1);
  const at = (row?.value as { at?: string } | undefined)?.at;
  return at ? new Date(at) : null;
}

/** The SQL that makes Supabase call the app every 5 minutes. */
export function schedulerSql(tickUrl: string, token: string): string {
  return `-- WeightWise reminder scheduler: calls the app every 5 minutes.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'weightwise-tick',
  '*/5 * * * *',
  $tick$
  select net.http_post(
    url := '${tickUrl}',
    headers := jsonb_build_object('Authorization', 'Bearer ${token}', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $tick$
);`;
}

/**
 * Tries to switch on Supabase's pg_cron and pg_net extensions and schedule
 * the tick. Works on Supabase, where the app's database user may do this.
 * Elsewhere it fails and the caller shows the SQL to run by hand.
 */
export async function installScheduler(tickUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = tickToken();
  if (!token) return { ok: false, reason: "APP_PASSWORD isn't set." };
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/api\/cron\/tick$/i.test(tickUrl)) {
    return { ok: false, reason: "The app needs to be opened from its https web address to set this up." };
  }
  const db = await getDb();
  const attempt = async (statements: string[]) => {
    for (const s of statements) await db.execute(sql.raw(s));
  };
  try {
    try {
      await attempt(["create extension if not exists pg_cron with schema pg_catalog"]);
    } catch {
      await attempt(["create extension if not exists pg_cron"]);
    }
    try {
      await attempt(["create extension if not exists pg_net with schema extensions"]);
    } catch {
      await attempt(["create extension if not exists pg_net"]);
    }
    await attempt([
      `select cron.schedule('weightwise-tick', '*/5 * * * *', $tick$ select net.http_post(url := '${tickUrl}', headers := jsonb_build_object('Authorization', 'Bearer ${token}', 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 55000); $tick$)`,
    ]);
    return { ok: true };
  } catch (err) {
    console.error("[scheduler]", err);
    const msg = (err as Error).message ?? "";
    return {
      ok: false,
      reason: /extension .* is not available|could not open extension control file/i.test(msg)
        ? "This database doesn't offer the scheduling extensions."
        : /permission denied|must be (owner|superuser)/i.test(msg)
          ? "The database didn't allow the app to switch the extensions on."
          : "The database couldn't set up the schedule.",
    };
  }
}
