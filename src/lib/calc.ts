import { DAY, addDays, diffDays, fromMs, toMs } from "./dates";

export const KCAL_PER_LB = 3500;
/** Smoothing time constant for the trend weight, in days. */
const TREND_TAU = 7;
/** Days under this are treated as incompletely logged and ignored. */
export const MIN_COMPLETE_DAY_KCAL = 700;

export type WeightPoint = { date: string; weight: number };
export type TrendPoint = WeightPoint & { trend: number };

/**
 * Exponentially smoothed trend weight. The smoothing factor depends on the
 * time since the previous weigh-in, so gaps in logging don't leave the trend
 * stuck on stale data: after a long gap the trend moves almost fully to the
 * new reading.
 */
export function computeTrend(logs: WeightPoint[]): TrendPoint[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let trend = 0;
  let prev: string | null = null;
  for (const p of sorted) {
    if (prev === null) {
      trend = p.weight;
    } else {
      const dt = Math.max(1, diffDays(p.date, prev));
      const alpha = 1 - Math.exp(-dt / TREND_TAU);
      trend += alpha * (p.weight - trend);
    }
    prev = p.date;
    out.push({ ...p, trend: round(trend, 2) });
  }
  return out;
}

/**
 * Rate of change of the trend in lb/week (negative = losing), by least-squares
 * fit over the weigh-ins within `windowDays` of `today`. Null when there is
 * not enough data to say anything meaningful.
 */
export function weeklyRate(
  points: TrendPoint[],
  today: string,
  windowDays = 28,
): number | null {
  const from = addDays(today, -windowDays);
  const win = points.filter((p) => p.date >= from && p.date <= today);
  if (win.length < 3) return null;
  const span = diffDays(win[win.length - 1].date, win[0].date);
  if (span < 7) return null;
  const xs = win.map((p) => diffDays(p.date, win[0].date));
  const ys = win.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return round((num / den) * 7, 2);
}

/** Longer window first, falling back so sparse loggers still get a rate. */
export function bestRate(points: TrendPoint[], today: string): number | null {
  return weeklyRate(points, today, 28) ?? weeklyRate(points, today, 60) ?? null;
}

export function projectDate(
  current: number,
  target: number,
  ratePerWeek: number | null,
  today: string,
): string | null {
  if (current <= target) return today;
  if (ratePerWeek === null || ratePerWeek > -0.2) return null;
  const days = Math.ceil(((current - target) / -ratePerWeek) * 7);
  if (days > 365 * 2) return null;
  return addDays(today, days);
}

export type Milestone = {
  key: string;
  weight: number;
  label: string;
  detail: string;
  achievedOn: string | null;
  projectedOn: string | null;
};

/**
 * Splits the journey from start to goal weight into 5 lb steps, plus the BMI
 * category boundaries that fall in between. A milestone counts as reached the
 * first day the trend weight is at or below it.
 */
export function buildMilestones(opts: {
  startWeight: number;
  goalWeight: number;
  heightIn: number;
  points: TrendPoint[];
  rate: number | null;
  today: string;
}): Milestone[] {
  const { startWeight, goalWeight, heightIn, points, rate, today } = opts;
  if (goalWeight >= startWeight) return [];
  const marks = new Map<number, { label: string; detail: string }>();

  const firstStep = Math.floor((startWeight - 0.01) / 5) * 5;
  for (let w = firstStep; w > goalWeight; w -= 5) {
    marks.set(w, { label: `${w} lb`, detail: `${round(startWeight - w, 1)} lb down` });
  }
  for (const [bmi, name] of [
    [30, "Out of the obese range"],
    [25, "Healthy BMI range"],
  ] as const) {
    const w = Math.floor(weightForBmi(bmi, heightIn) * 10) / 10;
    if (w < startWeight && w > goalWeight) {
      marks.set(w, { label: name, detail: `BMI under ${bmi} at ${w} lb` });
    }
  }
  marks.set(goalWeight, { label: "Goal weight", detail: `${goalWeight} lb` });

  const current = points.length ? points[points.length - 1].trend : startWeight;
  return [...marks.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([weight, m]) => {
      const hit = points.find((p) => p.trend <= weight);
      return {
        key: String(weight),
        weight,
        ...m,
        achievedOn: hit?.date ?? null,
        projectedOn: hit ? null : projectDate(current, weight, rate, today),
      };
    });
}

export function bmi(weightLb: number, heightIn: number): number {
  return round((weightLb / (heightIn * heightIn)) * 703, 1);
}

export function weightForBmi(bmiValue: number, heightIn: number): number {
  return (bmiValue * heightIn * heightIn) / 703;
}

export function bmiCategory(v: number): string {
  if (v < 18.5) return "Underweight";
  if (v < 25) return "Healthy";
  if (v < 30) return "Overweight";
  return "Obese";
}

export function ageOn(birthdate: string, today: string): number {
  let age = +today.slice(0, 4) - +birthdate.slice(0, 4);
  if (today.slice(5) < birthdate.slice(5)) age--;
  return age;
}

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function bmr(opts: {
  weightLb: number;
  heightIn: number;
  age: number;
  sex: "male" | "female";
}): number {
  const kg = opts.weightLb * 0.45359237;
  const cm = opts.heightIn * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * opts.age;
  return Math.round(opts.sex === "male" ? base + 5 : base - 161);
}

export const ACTIVITY: Record<string, { label: string; hint: string; factor: number }> = {
  sedentary: { label: "Sedentary", hint: "Desk job, little exercise", factor: 1.2 },
  light: { label: "Lightly active", hint: "Light exercise 1 to 3 days a week", factor: 1.375 },
  moderate: { label: "Moderately active", hint: "Exercise 3 to 5 days a week", factor: 1.55 },
  active: { label: "Very active", hint: "Hard exercise 6 to 7 days a week", factor: 1.725 },
};

export function formulaTdee(bmrKcal: number, activity: string): number {
  return Math.round(bmrKcal * (ACTIVITY[activity]?.factor ?? 1.375));
}

export type Expenditure = {
  kcal: number;
  source: "adaptive" | "formula";
  confidence: "low" | "medium" | "high";
  daysUsed: number;
  avgIntake: number | null;
  rate: number | null;
};

/**
 * Estimates real daily energy expenditure from what was eaten and how the
 * trend weight moved over the same window:
 *   expenditure = average intake - (weight change in lb/day x 3500).
 * Needs at least 7 fully logged days and a measurable trend; otherwise falls
 * back to the formula estimate.
 */
export function estimateExpenditure(opts: {
  points: TrendPoint[];
  dailyCalories: Map<string, number>;
  today: string;
  formula: number;
  windowDays?: number;
}): Expenditure {
  const { points, dailyCalories, today, formula, windowDays = 28 } = opts;
  const from = addDays(today, -windowDays);
  const intakes: number[] = [];
  for (const [date, kcal] of dailyCalories) {
    // Today is still in progress, so it never counts as a complete day.
    if (date >= from && date < today && kcal >= MIN_COMPLETE_DAY_KCAL) intakes.push(kcal);
  }
  const rate = weeklyRate(points, today, windowDays);
  const fallback: Expenditure = {
    kcal: formula,
    source: "formula",
    confidence: "low",
    daysUsed: intakes.length,
    avgIntake: intakes.length ? Math.round(avg(intakes)) : null,
    rate,
  };
  if (intakes.length < 7 || rate === null) return fallback;
  const avgIntake = avg(intakes);
  const raw = avgIntake - (rate / 7) * KCAL_PER_LB;
  // Guard against garbage in: an estimate far from the formula is more likely
  // a logging problem than a physiological fact.
  const kcal = clamp(raw, formula * 0.6, formula * 1.5);
  return {
    kcal: Math.round(kcal / 10) * 10,
    source: "adaptive",
    confidence: intakes.length >= 21 ? "high" : intakes.length >= 12 ? "medium" : "low",
    daysUsed: intakes.length,
    avgIntake: Math.round(avgIntake),
    rate,
  };
}

export function calorieFloor(sex: "male" | "female"): number {
  return sex === "male" ? 1500 : 1200;
}

export function suggestCalorieTarget(
  expenditure: number,
  paceLbPerWeek: number,
  sex: "male" | "female",
): number {
  const raw = expenditure - (paceLbPerWeek * KCAL_PER_LB) / 7;
  return Math.max(calorieFloor(sex), Math.round(raw / 10) * 10);
}

export function suggestProteinTarget(goalWeightLb: number): number {
  // ~0.8 g per lb of goal weight: enough to protect muscle in a deficit.
  return Math.round((goalWeightLb * 0.8) / 5) * 5;
}

/** True when the trend has been essentially flat for two weeks or more. */
export function isStalled(points: TrendPoint[], today: string): boolean {
  const recent = points.filter((p) => p.date >= addDays(today, -21));
  if (recent.length < 4) return false;
  const rate = weeklyRate(points, today, 21);
  return rate !== null && rate > -0.2;
}

/** Trend value at an arbitrary date, by linear interpolation. */
export function trendAt(points: TrendPoint[], date: string): number | null {
  if (!points.length) return null;
  if (date <= points[0].date) return points[0].trend;
  const last = points[points.length - 1];
  if (date >= last.date) return last.trend;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (date <= b.date) {
      const t = (toMs(date) - toMs(a.date)) / Math.max(DAY, toMs(b.date) - toMs(a.date));
      return round(a.trend + t * (b.trend - a.trend), 2);
    }
  }
  return last.trend;
}

/** Consecutive days with a weigh-in, ending today or yesterday. */
export function weighInStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export { fromMs };
