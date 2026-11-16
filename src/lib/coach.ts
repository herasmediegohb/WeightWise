import "server-only";
import type { CheckinStats, Profile } from "@/db/schema";
import { avg, round, suggestCalorieTarget, trendAt, MIN_COMPLETE_DAY_KCAL } from "./calc";
import { getFoodForDay, getOverview, getScans, getWaterTotals } from "./data";
import { addDays, formatShort, weekStart } from "./dates";

export const COACH_SYSTEM = `You are the coach inside WeightWise, a personal weight and nutrition tracker used by one person. Their profile and logged data are provided below, and they are the person you are talking to.

How to help:
- Ground every answer in their actual numbers. Quote the specific figures you are relying on (trend weight, rate of loss, average intake, estimated expenditure) so they can see the reasoning.
- Lead with the answer. Keep replies short enough to read on a phone: a few sentences or a short list, unless they ask for depth.
- "Trend weight" is a smoothed average of their weigh-ins. Judge progress by the trend and the weekly rate, never by a single day's reading. Day-to-day swings of 1 to 3 lb are water, sodium, and digestion.
- When they ask why progress stalled, work through the evidence: how the trend actually moved, how many days had food logged and whether that is enough to trust the intake average, intake against estimated expenditure, and how consistent the weigh-ins were. Say plainly when the data is too thin to conclude anything, and what to log to find out.
- For meal ideas, fit the calories and protein they have left today, give concrete portions, and prefer simple food. Offer two or three options.
- Units are pounds, ounces of water, kilocalories, and grams.
- Never recommend eating below their calorie floor, losing faster than 2 lb per week, or skipping meals to compensate. If something they describe sounds like a medical issue, say it is worth raising with a doctor, without lecturing.
- You can't log food or change settings yourself. If they want something logged, tell them where in the app to do it.
- Write plain conversational prose. Light markdown (bold, short lists) is fine. No headings, no tables.`;

function line(label: string, value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "" : `${label}: ${value}\n`;
}

/** Snapshot of the user's data, rendered as text for the model. */
export async function buildCoachContext(p: Profile, today: string): Promise<string> {
  const [o, scans, water, todayFood] = await Promise.all([
    getOverview(p, today),
    getScans(),
    getWaterTotals(addDays(today, -13), today),
    getFoodForDay(today),
  ]);
  const todayTotals = o.totals.get(today);
  const eaten = todayTotals?.calories ?? 0;
  const protein = todayTotals?.proteinG ?? 0;
  const waterVals = [...water.entries()].filter(([d]) => d !== today).map(([, v]) => v);

  let out = `<profile>\n`;
  out += line("Name", p.name);
  out += line("Today", today);
  out += line("Age", o.age);
  out += line("Sex", p.sex);
  out += line("Height", `${p.heightIn} in`);
  out += line("Started", `${p.startWeightLb} lb on ${p.startDate}`);
  out += line("Goal weight", `${p.goalWeightLb} lb`);
  out += line("Chosen pace", `${p.paceLbPerWeek} lb/week`);
  out += line("Daily calorie target", `${p.calorieTarget} kcal`);
  out += line("Daily protein target", `${p.proteinTargetG} g`);
  out += line("Daily water target", `${p.waterTargetOz} oz`);
  out += line("Calorie floor", `${p.sex === "male" ? 1500 : 1200} kcal`);
  out += `</profile>\n\n<status>\n`;
  out += line("Latest weigh-in", o.latest ? `${o.latest.weight} lb on ${o.latest.date}` : "none");
  out += line("Trend weight", `${round(o.currentTrend)} lb`);
  out += line("Lost so far (trend)", `${round(o.lost)} lb`);
  out += line("Left to goal", `${round(o.remaining)} lb`);
  out += line("Rate, recent weeks", o.rate === null ? "not enough data" : `${o.rate} lb/week`);
  out += line(
    "Projected goal date",
    o.goal.date
      ? `${o.goal.date} (likely ${o.goal.early ?? "?"} to ${o.goal.late ?? "later"}, ${o.range?.confidence} confidence from ${o.range?.weighIns} weigh-ins)`
      : "cannot project at the current rate",
  );
  if (o.range) out += line("Plausible rate range", `${o.range.fast} to ${o.range.slow} lb/week`);
  if (o.bodyFat) {
    const bf = o.bodyFat;
    out += line(
      "Body fat",
      `about ${bf.estimatedPct}% now (estimated: assumes lean mass of ${bf.leanMassLb} lb from the ${bf.scanDate} scan, which measured ${bf.scanPct}%)`,
    );
    out += line(
      "Body-fat milestones",
      bf.milestones
        .map((m) => `${m.pct}% at ${m.weight} lb: ${m.reached ? "reached" : m.date ? `projected ${m.date}` : "no date at current rate"}`)
        .join("; "),
    );
  }
  out += line("BMI", o.bmi);
  out += line("Resting energy (formula)", `${o.restingKcal} kcal`);
  out += line(
    "Estimated daily expenditure",
    `${o.expenditure.kcal} kcal (${
      o.expenditure.source === "adaptive"
        ? `derived from ${o.expenditure.daysUsed} logged days of intake and the trend, ${o.expenditure.confidence} confidence`
        : `formula estimate; only ${o.expenditure.daysUsed} fully logged days in the last 28, at least 7 needed to derive it from data`
    })`,
  );
  out += line("Average intake on logged days, last 28", o.expenditure.avgIntake ? `${o.expenditure.avgIntake} kcal` : "no complete days");
  out += line("Average water, last 2 weeks", waterVals.length ? `${Math.round(avg(waterVals))} oz over ${waterVals.length} logged days` : "not logged");
  out += line("Weigh-in streak", `${o.streak} days`);
  out += `</status>\n\n<today>\n`;
  out += line("Eaten", `${Math.round(eaten)} kcal, ${Math.round(protein)} g protein`);
  out += line("Remaining", `${Math.round(p.calorieTarget - eaten)} kcal, ${Math.max(0, Math.round(p.proteinTargetG - protein))} g protein`);
  out += line("Water", `${Math.round(water.get(today) ?? 0)} oz`);
  if (todayFood.length) {
    out += todayFood
      .map((f) => `- ${f.meal}: ${f.name}${f.quantity ? ` (${f.quantity})` : ""}, ${Math.round(f.calories)} kcal, ${Math.round(f.proteinG)} g protein`)
      .join("\n") + "\n";
  }
  out += `</today>\n\n<weigh_ins last="90 days" columns="date, scale lb, trend lb">\n`;
  const from = addDays(today, -90);
  out += o.points.filter((pt) => pt.date >= from).map((pt) => `${pt.date}, ${pt.weight}, ${pt.trend}`).join("\n") || "none";
  out += `\n</weigh_ins>\n\n<daily_intake last="28 days" columns="date, kcal, protein g, carbs g, fat g" note="days under ${MIN_COMPLETE_DAY_KCAL} kcal are probably incompletely logged">\n`;
  const from28 = addDays(today, -28);
  out += [...o.totals.entries()]
    .filter(([d]) => d >= from28)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, t]) => `${d}, ${Math.round(t.calories)}, ${Math.round(t.proteinG)}, ${Math.round(t.carbsG)}, ${Math.round(t.fatG)}`)
    .join("\n") || "nothing logged";
  out += `\n</daily_intake>\n`;
  if (scans.length) {
    out += `\n<body_composition_scans>\n`;
    out += scans
      .map((s) =>
        [
          s.date,
          s.bodyFatPct !== null && `body fat ${s.bodyFatPct}%`,
          s.muscleMassLb !== null && `muscle ${s.muscleMassLb} lb`,
          s.leanMassLb !== null && `lean ${s.leanMassLb} lb`,
          s.fatMassLb !== null && `fat ${s.fatMassLb} lb`,
          s.visceralFatLevel !== null && `visceral fat level ${s.visceralFatLevel}`,
        ]
          .filter(Boolean)
          .join(", "),
      )
      .join("\n");
    out += `\n</body_composition_scans>\n`;
  }
  return out;
}

/** Numbers for the weekly check-in covering the 7 days starting `start`. */
export async function buildCheckinStats(p: Profile, today: string, start: string) {
  const end = addDays(start, 6);
  const [o, water] = await Promise.all([getOverview(p, today), getWaterTotals(start, end)]);
  const inWeek = (d: string) => d >= start && d <= end;
  const days = [...o.totals.entries()].filter(([d, t]) => inWeek(d) && t.calories >= MIN_COMPLETE_DAY_KCAL);
  // A change is only meaningful if the scale was actually used that week.
  const weighIns = o.points.filter((pt) => inWeek(pt.date)).length;
  const measurable = weighIns > 0 && o.points.some((pt) => pt.date <= start);
  const trendStart = measurable ? trendAt(o.points, start) : null;
  const trendEnd = measurable ? trendAt(o.points, end) : null;
  const waterVals = [...water.values()];
  const stats: CheckinStats = {
    weekStart: start,
    weekEnd: end,
    trendStart,
    trendEnd,
    trendChange: trendStart !== null && trendEnd !== null ? round(trendEnd - trendStart, 1) : null,
    weighIns,
    avgCalories: days.length ? Math.round(avg(days.map(([, t]) => t.calories))) : null,
    avgProtein: days.length ? Math.round(avg(days.map(([, t]) => t.proteinG))) : null,
    daysLogged: days.length,
    avgWaterOz: waterVals.length ? Math.round(avg(waterVals)) : null,
    expenditure: o.expenditure.kcal,
    expenditureSource: o.expenditure.source,
    currentCalorieTarget: p.calorieTarget,
    targetPace: p.paceLbPerWeek,
  };
  const suggested = suggestCalorieTarget(o.expenditure.kcal, p.paceLbPerWeek, p.sex);
  return { stats, suggested, overview: o };
}

/** Plain summary used when AI is not configured, so the check-in still works. */
export function fallbackCheckinSummary(
  s: CheckinStats,
  suggested: number,
  _p?: Pick<Profile, "phase">,
): { headline: string; summary: string } {
  const parts: string[] = [];
  if (s.trendChange !== null) {
    parts.push(
      s.trendChange < -0.05
        ? `Your trend weight dropped **${Math.abs(s.trendChange)} lb** this week, against a target pace of ${s.targetPace} lb.`
        : s.trendChange > 0.05
          ? `Your trend weight rose **${s.trendChange} lb** this week.`
          : `Your trend weight held steady this week.`,
    );
  } else parts.push(`There weren't enough weigh-ins to measure this week's change (${s.weighIns} logged). Weighing in most mornings gives the trend something to work with.`);
  parts.push(
    s.daysLogged
      ? `You logged food on **${s.daysLogged} of 7 days**, averaging ${s.avgCalories} kcal and ${s.avgProtein} g protein.`
      : `No complete days of food were logged, so intake can't be assessed.`,
  );
  if (s.avgWaterOz !== null) parts.push(`Water averaged ${s.avgWaterOz} oz on the days you tracked it.`);
  parts.push(
    Math.abs(suggested - s.currentCalorieTarget) >= 50
      ? `Based on an estimated expenditure of ${s.expenditure} kcal, a target of **${suggested} kcal** matches your chosen pace.`
      : `Your current target of ${s.currentCalorieTarget} kcal still matches your chosen pace.`,
  );
  const headline =
    s.trendChange === null
      ? "Not enough weigh-ins this week"
      : s.trendChange < -0.05
        ? `Down ${Math.abs(s.trendChange)} lb this week`
        : s.trendChange > 0.05
          ? `Up ${s.trendChange} lb this week`
          : "Holding steady this week";
  return { headline, summary: parts.join("\n\n") };
}

export function lastCompletedWeekStart(today: string): string {
  return addDays(weekStart(today), -7);
}

export function weekLabel(start: string): string {
  return `${formatShort(start)} to ${formatShort(addDays(start, 6))}`;
}
