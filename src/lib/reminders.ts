import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Profile } from "@/db/schema";
import { generateCheckin } from "./checkin";
import { lastCompletedWeekStart } from "./coach";
import { getProfile } from "./data";
import { localClock, parseTime } from "./dates";
import { sendPush, type PushPayload } from "./push";
import { formatWater } from "./units";

/** A reminder is sent at most this long after its time, so a late tick doesn't wake you at midnight. */
const WINDOW_MIN = 3 * 60;
const CHECKIN_FROM = 8 * 60;
const CHECKIN_UNTIL = 21 * 60;

export type TickResult = { ran: string[]; skipped?: string };

/** Claims a (kind, date) slot; returns false if it was already sent. */
async function claim(kind: string, date: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .insert(schema.reminderLog)
    .values({ kind, date })
    .onConflictDoNothing()
    .returning({ id: schema.reminderLog.id });
  return rows.length > 0;
}

async function release(kind: string, date: string) {
  const db = await getDb();
  await db.delete(schema.reminderLog).where(and(eq(schema.reminderLog.kind, kind), eq(schema.reminderLog.date, date)));
}

/** Sends once per day per kind; un-claims if no device received it, so a later tick retries. */
async function sendOnce(kind: string, date: string, payload: PushPayload, origin: string): Promise<boolean> {
  if (!(await claim(kind, date))) return false;
  const { sent } = await sendPush(payload, origin);
  if (sent === 0) await release(kind, date);
  return sent > 0;
}

function due(time: string | null, nowMin: number): boolean {
  const t = parseTime(time);
  return t !== null && nowMin >= t && nowMin < t + WINDOW_MIN;
}

/**
 * Runs every few minutes from the database scheduler. Sends the reminders
 * that are due, creates Monday's check-in, and makes the weekly backup.
 */
export async function runTick(origin: string, extra?: (p: Profile, local: ReturnType<typeof localClock>) => Promise<string[]>): Promise<TickResult> {
  const p = await getProfile();
  if (!p) return { ran: [], skipped: "no profile yet" };
  const local = localClock(p.timezone);
  const ran: string[] = [];
  const db = await getDb();

  if (due(p.reminderWeighIn, local.minutes)) {
    const [logged] = await db
      .select({ id: schema.weightLogs.id })
      .from(schema.weightLogs)
      .where(eq(schema.weightLogs.date, local.date))
      .limit(1);
    if (!logged) {
      const sent = await sendOnce(
        "weigh-in",
        local.date,
        {
          title: "Time to weigh in",
          body: "Step on the scale before breakfast and log it. It takes five seconds.",
          url: "/",
          tag: "weigh-in",
        },
        origin,
      );
      if (sent) ran.push("weigh-in reminder");
    }
  }

  if (due(p.reminderWater, local.minutes)) {
    const [{ oz }] = await db
      .select({ oz: sql<number>`coalesce(sum(${schema.waterLogs.oz}), 0)`.mapWith(Number) })
      .from(schema.waterLogs)
      .where(eq(schema.waterLogs.date, local.date));
    // Only nudge when behind: under half the day's target at reminder time.
    if (oz < p.waterTargetOz / 2) {
      const sent = await sendOnce(
        "water",
        local.date,
        {
          title: "Water check",
          body: `You're at ${formatWater(oz, p.units)} of ${formatWater(p.waterTargetOz, p.units)} today. Have a glass now.`,
          url: "/",
          tag: "water",
        },
        origin,
      );
      if (sent) ran.push("water reminder");
    }
  }

  // Monday morning: create last week's check-in if it doesn't exist yet.
  if (local.weekday === 1 && local.minutes >= CHECKIN_FROM && local.minutes < CHECKIN_UNTIL) {
    const start = lastCompletedWeekStart(local.date);
    const [existing] = await db
      .select({ id: schema.checkins.id })
      .from(schema.checkins)
      .where(eq(schema.checkins.weekStart, start))
      .limit(1);
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.weightLogs);
    if (!existing && n >= 2 && (await claim("checkin", local.date))) {
      const { headline } = await generateCheckin(p, local.date);
      ran.push("weekly check-in");
      if (p.notifyCheckin) {
        const { sent } = await sendPush(
          { title: "Your weekly check-in is ready", body: headline, url: "/coach", tag: "checkin" },
          origin,
        );
        if (sent) ran.push("check-in notification");
      }
    }
  }

  if (extra) ran.push(...(await extra(p, local)));
  return { ran };
}

