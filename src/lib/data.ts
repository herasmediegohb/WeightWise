import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Profile } from "@/db/schema";
import {
  ageOn,
  bestRate,
  bmi,
  bmr,
  buildMilestones,
  computeTrend,
  estimateExpenditure,
  formulaTdee,
  isStalled,
  projectDate,
  weighInStreak,
} from "./calc";
import { addDays } from "./dates";

const { profile, weightLogs, foodEntries, waterLogs, bodyScans, savedMeals, checkins, chatMessages } =
  schema;

/** Cached per request, so the layout and the page share one query. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const db = await getDb();
  const rows = await db.select().from(profile).where(eq(profile.id, 1)).limit(1);
  return rows[0] ?? null;
});

export async function getWeights() {
  const db = await getDb();
  return db.select().from(weightLogs).orderBy(asc(weightLogs.date));
}

export async function getFoodForDay(date: string) {
  const db = await getDb();
  return db
    .select()
    .from(foodEntries)
    .where(eq(foodEntries.date, date))
    .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id));
}

export type DayTotals = { calories: number; proteinG: number; carbsG: number; fatG: number };

export async function getDailyTotals(from: string, to: string): Promise<Map<string, DayTotals>> {
  const db = await getDb();
  const rows = await db
    .select({
      date: foodEntries.date,
      calories: sql<number>`sum(${foodEntries.calories})`.mapWith(Number),
      proteinG: sql<number>`sum(${foodEntries.proteinG})`.mapWith(Number),
      carbsG: sql<number>`sum(${foodEntries.carbsG})`.mapWith(Number),
      fatG: sql<number>`sum(${foodEntries.fatG})`.mapWith(Number),
    })
    .from(foodEntries)
    .where(and(gte(foodEntries.date, from), lte(foodEntries.date, to)))
    .groupBy(foodEntries.date);
  return new Map(rows.map(({ date, ...t }) => [date, t]));
}

export async function getWaterTotals(from: string, to: string): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ date: waterLogs.date, oz: sql<number>`sum(${waterLogs.oz})`.mapWith(Number) })
    .from(waterLogs)
    .where(and(gte(waterLogs.date, from), lte(waterLogs.date, to)))
    .groupBy(waterLogs.date);
  return new Map(rows.map((r) => [r.date, r.oz]));
}

export async function getScans() {
  const db = await getDb();
  return db.select().from(bodyScans).orderBy(asc(bodyScans.date));
}

export async function getSavedMeals() {
  const db = await getDb();
  return db.select().from(savedMeals).orderBy(desc(savedMeals.useCount), desc(savedMeals.lastUsedAt));
}

/** Distinct recent foods, newest first, for one-tap re-logging. */
export async function getRecentFoods(limit = 12) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(foodEntries)
    .where(sql`${foodEntries.source} <> 'import'`)
    .orderBy(desc(foodEntries.createdAt))
    .limit(80);
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    const key = `${r.name.toLowerCase()}|${r.quantity ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export async function getCheckins(limit = 8) {
  const db = await getDb();
  return db.select().from(checkins).orderBy(desc(checkins.weekStart)).limit(limit);
}

export async function getChat(limit = 60) {
  const db = await getDb();
  const rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.id)).limit(limit);
  return rows.reverse();
}

/** Everything derived from the logs that more than one screen needs. */
export async function getOverview(p: Profile, today: string) {
  const [weights, totals] = await Promise.all([
    getWeights(),
    getDailyTotals(addDays(today, -60), today),
  ]);
  const points = computeTrend(weights.map((w) => ({ date: w.date, weight: w.weightLb })));
  const latest = points.at(-1) ?? null;
  const currentTrend = latest?.trend ?? p.startWeightLb;
  const currentWeight = latest?.weight ?? p.startWeightLb;
  const rate = bestRate(points, today);
  const age = ageOn(p.birthdate, today);
  const restingKcal = bmr({ weightLb: currentTrend, heightIn: p.heightIn, age, sex: p.sex });
  const formula = formulaTdee(restingKcal, p.activityLevel);
  const dailyCalories = new Map([...totals].map(([d, t]) => [d, t.calories]));
  const expenditure = estimateExpenditure({ points, dailyCalories, today, formula });
  const milestones = buildMilestones({
    startWeight: p.startWeightLb,
    goalWeight: p.goalWeightLb,
    heightIn: p.heightIn,
    points,
    rate,
    today,
  });
  const totalToLose = p.startWeightLb - p.goalWeightLb;
  const lost = p.startWeightLb - currentTrend;
  return {
    weights,
    points,
    totals,
    latest,
    currentTrend,
    currentWeight,
    rate,
    age,
    restingKcal,
    expenditure,
    milestones,
    lost,
    remaining: Math.max(0, currentTrend - p.goalWeightLb),
    progress: totalToLose > 0 ? Math.min(1, Math.max(0, lost / totalToLose)) : 0,
    goalDate: projectDate(currentTrend, p.goalWeightLb, rate, today),
    bmi: bmi(currentTrend, p.heightIn),
    stalled: isStalled(points, today),
    streak: weighInStreak(weights.map((w) => w.date), today),
    loggedToday: weights.some((w) => w.date === today),
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
