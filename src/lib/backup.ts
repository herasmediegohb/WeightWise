import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Tables included in a backup, in an order that restores cleanly. */
const TABLES = {
  profile: schema.profile,
  weightLogs: schema.weightLogs,
  foodEntries: schema.foodEntries,
  savedMeals: schema.savedMeals,
  waterLogs: schema.waterLogs,
  bodyScans: schema.bodyScans,
  checkins: schema.checkins,
  chatMessages: schema.chatMessages,
} as const;
type TableKey = keyof typeof TABLES;

/** Postgres table names, for resetting id sequences after a restore. */
const SQL_NAMES: Record<Exclude<TableKey, "profile">, string> = {
  weightLogs: "weight_logs",
  foodEntries: "food_entries",
  savedMeals: "saved_meals",
  waterLogs: "water_logs",
  bodyScans: "body_scans",
  checkins: "checkins",
  chatMessages: "chat_messages",
};

export type Snapshot = {
  app: "weightwise";
  version: 1;
  exportedAt: string;
  profile: unknown;
} & Record<Exclude<TableKey, "profile">, unknown[]>;

export async function snapshot(): Promise<Snapshot> {
  const db = await getDb();
  const [profile, weightLogs, foodEntries, savedMeals, waterLogs, bodyScans, checkins, chatMessages] = await Promise.all([
    db.select().from(schema.profile),
    db.select().from(schema.weightLogs),
    db.select().from(schema.foodEntries),
    db.select().from(schema.savedMeals),
    db.select().from(schema.waterLogs),
    db.select().from(schema.bodyScans),
    db.select().from(schema.checkins),
    db.select().from(schema.chatMessages),
  ]);
  return {
    app: "weightwise",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile[0] ?? null,
    weightLogs,
    foodEntries,
    savedMeals,
    waterLogs,
    bodyScans,
    checkins,
    chatMessages,
  };
}

export const offsiteConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const KEEP_IN_DATABASE = 10;
const KEEP_OFFSITE = 12;

/**
 * Saves a snapshot in the database and, when a Vercel Blob store is
 * connected, a private copy there too, so a problem with the database
 * itself can't take the backups with it.
 */
export async function createBackup(reason: "weekly" | "manual" | "before-restore"): Promise<{ id: number; offsite: boolean }> {
  const db = await getDb();
  const data = await snapshot();
  const json = JSON.stringify(data);
  const [row] = await db
    .insert(schema.backups)
    .values({ reason, data, sizeBytes: Buffer.byteLength(json) })
    .returning({ id: schema.backups.id });

  const old = await db
    .select({ id: schema.backups.id })
    .from(schema.backups)
    .orderBy(desc(schema.backups.createdAt))
    .offset(KEEP_IN_DATABASE);
  if (old.length) await db.delete(schema.backups).where(inArray(schema.backups.id, old.map((o) => o.id)));

  let offsite = false;
  if (offsiteConfigured()) {
    try {
      const { put, list, del } = await import("@vercel/blob");
      const stamp = data.exportedAt.replace(/[:.]/g, "-");
      await put(`weightwise-backups/${stamp}-${reason}.json`, json, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      offsite = true;
      const { blobs } = await list({ prefix: "weightwise-backups/" });
      const stale = blobs
        .sort((a, b) => b.pathname.localeCompare(a.pathname))
        .slice(KEEP_OFFSITE)
        .map((b) => b.url);
      if (stale.length) await del(stale);
    } catch (err) {
      console.error("[backup] off-site copy failed", err);
    }
  }
  return { id: row.id, offsite };
}

/** Called by the scheduler: one weekly backup, any time of day. */
export async function runWeeklyBackup(local: { date: string }): Promise<string[]> {
  void local;
  const db = await getDb();
  const since = new Date(Date.now() - 7 * 86_400_000 + 30 * 60_000);
  const [recent] = await db
    .select({ id: schema.backups.id })
    .from(schema.backups)
    .where(sql`${schema.backups.reason} = 'weekly' and ${schema.backups.createdAt} >= ${since}`)
    .limit(1);
  if (recent) return [];
  const { offsite } = await createBackup("weekly");
  return [offsite ? "weekly backup (with off-site copy)" : "weekly backup"];
}

export async function listBackups() {
  const db = await getDb();
  return db
    .select({ id: schema.backups.id, reason: schema.backups.reason, sizeBytes: schema.backups.sizeBytes, createdAt: schema.backups.createdAt })
    .from(schema.backups)
    .orderBy(desc(schema.backups.createdAt));
}

export async function getBackup(id: number): Promise<Snapshot | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.backups).where(eq(schema.backups.id, id)).limit(1);
  return (row?.data as Snapshot) ?? null;
}

export async function latestBackupAt(): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db
    .select({ at: schema.backups.createdAt })
    .from(schema.backups)
    .orderBy(desc(schema.backups.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/** Turns ISO strings back into Dates for timestamp columns (keys ending in "At"). */
function revive(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = /At$/.test(k) && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

export function validateSnapshot(data: unknown): Snapshot | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // Accept both backups and the earlier "Export everything" files.
  const keys: Exclude<TableKey, "profile">[] = ["weightLogs", "foodEntries", "savedMeals", "waterLogs", "bodyScans", "checkins", "chatMessages"];
  if (!keys.every((k) => Array.isArray(d[k]))) return null;
  if (d.profile !== null && typeof d.profile !== "object") return null;
  return d as unknown as Snapshot;
}

/**
 * Replaces all data with a snapshot, in one transaction: either everything
 * is restored or nothing changes. A backup of the current data is taken first.
 */
export async function restoreSnapshot(data: Snapshot): Promise<{ weighIns: number; foods: number }> {
  await createBackup("before-restore");
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const key of Object.keys(TABLES).reverse() as TableKey[]) await tx.delete(TABLES[key]);
    if (data.profile) await tx.insert(schema.profile).values(revive(data.profile as Record<string, unknown>) as never);
    for (const key of Object.keys(SQL_NAMES) as Exclude<TableKey, "profile">[]) {
      const rows = (data[key] as Record<string, unknown>[]).map(revive);
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(TABLES[key]).values(rows.slice(i, i + 500) as never);
      }
      const t = SQL_NAMES[key];
      await tx.execute(
        sql.raw(`select setval(pg_get_serial_sequence('${t}', 'id'), coalesce((select max(id) from ${t}), 0) + 1, false)`),
      );
    }
  });
  return { weighIns: data.weightLogs.length, foods: data.foodEntries.length };
}
