import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Profile } from "@/db/schema";
import {
  ageOn,
  bodyFatPlan,
  bmi,
  bmr,
  buildMilestones,
  computeTrend,
  estimateExpenditure,
  formulaTdee,
  isStalled,
  projectDate,
  projectRange,
  rateRange,
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

export type QuickFood = {
  name: string;
  quantity: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  timesLogged: number;
};

/**
 * Foods logged more than once in the last 90 days, most frequent first,
 * then the most recent one-offs. Uses the latest values logged for each.
 */
export async function getFrequentFoods(today: string, limit = 15): Promise<QuickFood[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(foodEntries)
    .where(and(gte(foodEntries.date, addDays(today, -90)), sql`${foodEntries.source} <> 'import'`))
    .orderBy(desc(foodEntries.createdAt))
    .limit(400);
  const groups = new Map<string, { food: QuickFood; last: number }>();
  rows.forEach((r, i) => {
    const key = `${r.name.trim().toLowerCase()}|${(r.quantity ?? "").trim().toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.food.timesLogged++;
    else
      groups.set(key, {
        last: i,
        food: {
          name: r.name,
          quantity: r.quantity ?? "",
          calories: r.calories,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          timesLogged: 1,
        },
      });
  });
  return [...groups.values()]
    .sort((a, b) => b.food.timesLogged - a.food.timesLogged || a.last - b.last)
    .slice(0, limit)
    .map((g) => g.food);
}

export type PastMeal = { meal: "breakfast" | "lunch" | "dinner" | "snack"; items: QuickFood[]; calories: number };

/** The meals logged on one day, for "copy yesterday's breakfast". */
export async function getMealsForDay(date: string): Promise<PastMeal[]> {
  const rows = (await getFoodForDay(date)).filter((r) => r.source !== "import");
  const order = ["breakfast", "lunch", "dinner", "snack"] as const;
  return order
    .map((meal) => {
      const items = rows
        .filter((r) => r.meal === meal)
        .map((r) => ({
          name: r.name,
          quantity: r.quantity ?? "",
          calories: r.calories,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          timesLogged: 1,
        }));
      return { meal, items, calories: items.reduce((a, i) => a + i.calories, 0) };
    })
    .filter((m) => m.items.length > 0);
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
  const [weights, totals, scans] = await Promise.all([
    getWeights(),
    getDailyTotals(addDays(today, -60), today),
    getScans(),
  ]);
  const points = computeTrend(weights.map((w) => ({ date: w.date, weight: w.weightLb })));
  const latest = points.at(-1) ?? null;
  const currentTrend = latest?.trend ?? p.startWeightLb;
  const currentWeight = latest?.weight ?? p.startWeightLb;
  const range = rateRange(points, today);
  const rate = range?.rate ?? null;
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
    range,
    today,
  });
  const lastFatScan = [...scans].reverse().find((sc) => sc.bodyFatPct !== null) ?? null;
  const bodyFat = bodyFatPlan({ scan: lastFatScan, points, currentTrend, range, today });
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
    range,
    goal: projectRange(currentTrend, p.goalWeightLb, range, today),
    goalDate: projectDate(currentTrend, p.goalWeightLb, rate, today),
    bodyFat,
    bmi: bmi(currentTrend, p.heightIn),
    stalled: isStalled(points, today),
    streak: weighInStreak(weights.map((w) => w.date), today),
    loggedToday: weights.some((w) => w.date === today),
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
