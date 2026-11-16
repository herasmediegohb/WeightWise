"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { FoodItem } from "@/db/schema";
import {
  SESSION_COOKIE,
  authConfigured,
  createSessionToken,
  passwordMatches,
  sessionCookieOptions,
} from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { isValidDate } from "@/lib/dates";
import { assertAuthed } from "@/lib/session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const refresh = () => revalidatePath("/", "layout");

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = (typeof MEALS)[number];

function finite(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? n : null;
}
const optional = (v: unknown, min: number, max: number) =>
  v === "" || v === null || v === undefined ? null : finite(v, min, max);

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(_: unknown, form: FormData): Promise<{ error: string } | undefined> {
  if (!authConfigured()) return { error: "APP_PASSWORD isn't set on the server yet." };
  // Small fixed delay blunts rapid guessing without a rate-limit store.
  await new Promise((r) => setTimeout(r, 400));
  if (!(await passwordMatches(String(form.get("password") ?? "")))) {
    return { error: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ── Profile ─────────────────────────────────────────────────────────────────

export type ProfileInput = {
  name: string;
  birthdate: string;
  sex: "male" | "female";
  heightIn: number;
  startWeightLb: number;
  startDate: string;
  goalWeightLb: number;
  paceLbPerWeek: number;
  activityLevel: "sedentary" | "light" | "moderate" | "active";
  calorieTarget: number;
  proteinTargetG: number;
  waterTargetOz: number;
};

export async function saveProfile(input: ProfileInput): Promise<Result> {
  await assertAuthed();
  const name = input.name?.trim();
  if (!name) return fail("Enter your name.");
  if (!isValidDate(input.birthdate)) return fail("Enter your date of birth.");
  if (!isValidDate(input.startDate)) return fail("Enter a start date.");
  if (input.sex !== "male" && input.sex !== "female") return fail("Choose a sex for the energy formula.");
  const heightIn = finite(input.heightIn, 36, 96);
  const startWeightLb = finite(input.startWeightLb, 50, 800);
  const goalWeightLb = finite(input.goalWeightLb, 50, 800);
  const pace = finite(input.paceLbPerWeek, 0.25, 2);
  const calorieTarget = finite(input.calorieTarget, 800, 6000);
  const proteinTargetG = finite(input.proteinTargetG, 20, 400);
  const waterTargetOz = finite(input.waterTargetOz, 16, 300);
  if (heightIn === null) return fail("Enter a height between 3 and 8 feet.");
  if (startWeightLb === null || goalWeightLb === null) return fail("Enter weights in pounds.");
  if (goalWeightLb >= startWeightLb) return fail("Your goal weight should be below your starting weight.");
  if (pace === null) return fail("Choose a pace between 0.25 and 2 lb per week.");
  if (calorieTarget === null) return fail("Enter a calorie target between 800 and 6000.");
  if (proteinTargetG === null) return fail("Enter a protein target between 20 and 400 g.");
  if (waterTargetOz === null) return fail("Enter a water target between 16 and 300 oz.");
  if (!["sedentary", "light", "moderate", "active"].includes(input.activityLevel)) {
    return fail("Choose an activity level.");
  }
  const values = {
    id: 1,
    name,
    birthdate: input.birthdate,
    sex: input.sex,
    heightIn,
    startWeightLb,
    startDate: input.startDate,
    goalWeightLb,
    paceLbPerWeek: pace,
    activityLevel: input.activityLevel,
    calorieTarget: Math.round(calorieTarget),
    proteinTargetG: Math.round(proteinTargetG),
    waterTargetOz: Math.round(waterTargetOz),
  };
  const db = await getDb();
  await db.insert(schema.profile).values(values).onConflictDoUpdate({ target: schema.profile.id, set: values });
  // The first weigh-in is the starting weight, unless history already exists.
  await db
    .insert(schema.weightLogs)
    .values({ date: input.startDate, weightLb: startWeightLb })
    .onConflictDoNothing();
  refresh();
  return { ok: true };
}

// ── Weight ──────────────────────────────────────────────────────────────────

export async function logWeight(input: { date: string; weightLb: number; note?: string }): Promise<Result> {
  await assertAuthed();
  if (!isValidDate(input.date)) return fail("Pick a valid date.");
  const weightLb = finite(input.weightLb, 50, 800);
  if (weightLb === null) return fail("Enter a weight between 50 and 800 lb.");
  const note = input.note?.trim() || null;
  const db = await getDb();
  await db
    .insert(schema.weightLogs)
    .values({ date: input.date, weightLb, note })
    .onConflictDoUpdate({ target: schema.weightLogs.date, set: { weightLb, note } });
  refresh();
  return { ok: true };
}

export async function deleteWeight(id: number): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  await db.delete(schema.weightLogs).where(eq(schema.weightLogs.id, id));
  refresh();
  return { ok: true };
}

// ── Water ───────────────────────────────────────────────────────────────────

export async function addWater(input: { date: string; oz: number }): Promise<Result> {
  await assertAuthed();
  if (!isValidDate(input.date)) return fail("Pick a valid date.");
  const oz = finite(input.oz, 1, 200);
  if (oz === null) return fail("Enter an amount between 1 and 200 oz.");
  const db = await getDb();
  await db.insert(schema.waterLogs).values({ date: input.date, oz });
  refresh();
  return { ok: true };
}

/** Removes the most recent water entry for the day. */
export async function undoWater(date: string): Promise<Result> {
  await assertAuthed();
  if (!isValidDate(date)) return fail("Pick a valid date.");
  const db = await getDb();
  const last = await db
    .select({ id: schema.waterLogs.id })
    .from(schema.waterLogs)
    .where(eq(schema.waterLogs.date, date))
    .orderBy(desc(schema.waterLogs.id))
    .limit(1);
  if (last[0]) await db.delete(schema.waterLogs).where(eq(schema.waterLogs.id, last[0].id));
  refresh();
  return { ok: true };
}

// ── Food ────────────────────────────────────────────────────────────────────

function cleanItems(items: FoodItem[]): FoodItem[] | null {
  if (!Array.isArray(items) || !items.length || items.length > 40) return null;
  const out: FoodItem[] = [];
  for (const i of items) {
    const name = String(i.name ?? "").trim().slice(0, 120);
    const calories = finite(i.calories, 0, 10000);
    if (!name || calories === null) return null;
    out.push({
      name,
      quantity: String(i.quantity ?? "").trim().slice(0, 80),
      calories,
      proteinG: finite(i.proteinG, 0, 1000) ?? 0,
      carbsG: finite(i.carbsG, 0, 2000) ?? 0,
      fatG: finite(i.fatG, 0, 1000) ?? 0,
    });
  }
  return out;
}

export async function addFood(input: {
  date: string;
  meal: Meal;
  items: FoodItem[];
  source: "ai_text" | "ai_photo" | "manual" | "saved";
  saveAs?: string;
  savedMealId?: number;
}): Promise<Result> {
  await assertAuthed();
  if (!isValidDate(input.date)) return fail("Pick a valid date.");
  if (!MEALS.includes(input.meal)) return fail("Choose a meal.");
  const items = cleanItems(input.items);
  if (!items) return fail("Each food needs a name and a calorie value.");
  const db = await getDb();
  await db.insert(schema.foodEntries).values(
    items.map((i) => ({
      date: input.date,
      meal: input.meal,
      name: i.name,
      quantity: i.quantity || null,
      calories: i.calories,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
      source: input.source,
    })),
  );
  const saveAs = input.saveAs?.trim().slice(0, 80);
  if (saveAs) await db.insert(schema.savedMeals).values({ name: saveAs, items, useCount: 1 });
  if (input.savedMealId) {
    await db
      .update(schema.savedMeals)
      .set({ useCount: sql`${schema.savedMeals.useCount} + 1`, lastUsedAt: new Date() })
      .where(eq(schema.savedMeals.id, input.savedMealId));
  }
  refresh();
  return { ok: true };
}

export async function updateFood(input: { id: number; meal: Meal } & FoodItem): Promise<Result> {
  await assertAuthed();
  const items = cleanItems([input]);
  if (!items) return fail("The food needs a name and a calorie value.");
  if (!MEALS.includes(input.meal)) return fail("Choose a meal.");
  const [i] = items;
  const db = await getDb();
  await db
    .update(schema.foodEntries)
    .set({ meal: input.meal, name: i.name, quantity: i.quantity || null, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG })
    .where(eq(schema.foodEntries.id, input.id));
  refresh();
  return { ok: true };
}

export async function deleteFood(id: number): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  await db.delete(schema.foodEntries).where(eq(schema.foodEntries.id, id));
  refresh();
  return { ok: true };
}

export async function deleteSavedMeal(id: number): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  await db.delete(schema.savedMeals).where(eq(schema.savedMeals.id, id));
  refresh();
  return { ok: true };
}

// ── Body composition ────────────────────────────────────────────────────────

export type ScanInput = {
  date: string;
  bodyFatPct?: number | string | null;
  muscleMassLb?: number | string | null;
  leanMassLb?: number | string | null;
  fatMassLb?: number | string | null;
  visceralFatLevel?: number | string | null;
  waterPct?: number | string | null;
  bmrKcal?: number | string | null;
  note?: string;
};

export async function saveScan(input: ScanInput): Promise<Result> {
  await assertAuthed();
  if (!isValidDate(input.date)) return fail("Pick a valid date.");
  const values = {
    bodyFatPct: optional(input.bodyFatPct, 2, 75),
    muscleMassLb: optional(input.muscleMassLb, 10, 400),
    leanMassLb: optional(input.leanMassLb, 20, 500),
    fatMassLb: optional(input.fatMassLb, 1, 600),
    visceralFatLevel: optional(input.visceralFatLevel, 1, 60),
    waterPct: optional(input.waterPct, 20, 80),
    bmrKcal: optional(input.bmrKcal, 500, 5000),
    note: input.note?.trim() || null,
  };
  const { note: _note, ...measures } = values;
  void _note;
  if (Object.values(measures).every((v) => v === null)) {
    return fail("Enter at least one measurement. Check that each value is in a realistic range.");
  }
  const db = await getDb();
  await db
    .insert(schema.bodyScans)
    .values({ date: input.date, ...values })
    .onConflictDoUpdate({ target: schema.bodyScans.date, set: values });
  refresh();
  return { ok: true };
}

export async function deleteScan(id: number): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  await db.delete(schema.bodyScans).where(eq(schema.bodyScans.id, id));
  refresh();
  return { ok: true };
}

// ── Coach ───────────────────────────────────────────────────────────────────

export async function applyCheckinTarget(id: number): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  const [c] = await db.select().from(schema.checkins).where(eq(schema.checkins.id, id)).limit(1);
  if (!c?.suggestedCalories) return fail("That check-in has no suggested target.");
  await db.update(schema.profile).set({ calorieTarget: c.suggestedCalories }).where(eq(schema.profile.id, 1));
  await db.update(schema.checkins).set({ appliedAt: new Date() }).where(eq(schema.checkins.id, id));
  refresh();
  return { ok: true };
}

export async function clearChat(): Promise<Result> {
  await assertAuthed();
  const db = await getDb();
  await db.delete(schema.chatMessages);
  refresh();
  return { ok: true };
}

// ── Import from Base44 CSV exports ──────────────────────────────────────────

export type ImportSummary = {
  weights: number;
  foodDays: number;
  waterDays: number;
  scans: number;
  skippedFiles: string[];
  earliest: { date: string; weightLb: number } | null;
  latest: { date: string; weightLb: number } | null;
};

export async function importCsvFiles(files: { name: string; text: string }[]): Promise<Result<{ summary: ImportSummary }>> {
  await assertAuthed();
  if (!files.length) return fail("Choose at least one CSV file.");
  if (files.some((f) => f.text.length > 5_000_000)) return fail("One of those files is too large.");
  const db = await getDb();
  const summary: ImportSummary = {
    weights: 0, foodDays: 0, waterDays: 0, scans: 0, skippedFiles: [], earliest: null, latest: null,
  };

  for (const file of files) {
    const rows = parseCsv(file.text);
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    if (cols.includes("weight_lb")) {
      for (const r of rows) {
        const weightLb = finite(r.weight_lb, 50, 800);
        if (!isValidDate(r.date) || weightLb === null) continue;
        const note = r.notes?.trim() || null;
        await db
          .insert(schema.weightLogs)
          .values({ date: r.date, weightLb, note })
          .onConflictDoUpdate({ target: schema.weightLogs.date, set: { weightLb, note } });
        summary.weights++;
      }
    } else if (cols.includes("calories_consumed")) {
      for (const r of rows) {
        if (!isValidDate(r.date)) continue;
        const calories = finite(r.calories_consumed, 1, 20000);
        if (calories !== null) {
          // Re-importing replaces the previous import for that day.
          await db
            .delete(schema.foodEntries)
            .where(sql`${schema.foodEntries.date} = ${r.date} and ${schema.foodEntries.source} = 'import'`);
          await db.insert(schema.foodEntries).values({
            date: r.date,
            meal: "snack",
            name: "Daily total (imported)",
            calories,
            proteinG: finite(r.protein_g, 0, 1000) ?? 0,
            carbsG: finite(r.carbs_g, 0, 2000) ?? 0,
            fatG: finite(r.fat_g, 0, 1000) ?? 0,
            source: "import",
          });
          summary.foodDays++;
        }
        const oz = finite(r.water_oz, 1, 500);
        if (oz !== null) {
          const existing = await db
            .select({ id: schema.waterLogs.id })
            .from(schema.waterLogs)
            .where(eq(schema.waterLogs.date, r.date))
            .limit(1);
          if (!existing.length) {
            await db.insert(schema.waterLogs).values({ date: r.date, oz });
            summary.waterDays++;
          }
        }
      }
    } else if (cols.includes("body_fat_pct")) {
      for (const r of rows) {
        if (!isValidDate(r.date)) continue;
        const values = {
          bodyFatPct: optional(r.body_fat_pct, 2, 75),
          muscleMassLb: optional(r.muscle_mass_lb, 10, 400),
          leanMassLb: optional(r.lean_mass_lb, 20, 500),
          fatMassLb: optional(r.fat_mass_lb, 1, 600),
          visceralFatLevel: optional(r.visceral_fat_level, 1, 60),
          waterPct: optional(r.water_pct, 20, 80),
          bmrKcal: optional(r.bmr_kcal, 500, 5000),
          note: r.notes?.trim() || null,
        };
        const { note: _n, ...m } = values;
        void _n;
        if (Object.values(m).every((v) => v === null)) continue;
        await db
          .insert(schema.bodyScans)
          .values({ date: r.date, ...values })
          .onConflictDoUpdate({ target: schema.bodyScans.date, set: values });
        summary.scans++;
      }
    } else {
      summary.skippedFiles.push(file.name);
    }
  }

  const all = await db.select().from(schema.weightLogs).orderBy(schema.weightLogs.date);
  if (all.length) {
    summary.earliest = { date: all[0].date, weightLb: all[0].weightLb };
    summary.latest = { date: all[all.length - 1].date, weightLb: all[all.length - 1].weightLb };
  }
  refresh();
  return { ok: true, summary };
}

/** Permanently deletes everything, including the profile. */
export async function deleteAllData(confirm: string): Promise<Result> {
  await assertAuthed();
  if (confirm !== "DELETE") return fail('Type DELETE to confirm.');
  const db = await getDb();
  await db.delete(schema.chatMessages);
  await db.delete(schema.checkins);
  await db.delete(schema.bodyScans);
  await db.delete(schema.waterLogs);
  await db.delete(schema.savedMeals);
  await db.delete(schema.foodEntries);
  await db.delete(schema.weightLogs);
  await db.delete(schema.profile);
  refresh();
  return { ok: true };
}
