import { describe, expect, it } from "vitest";
import {
  bmi,
  bmr,
  buildMilestones,
  computeTrend,
  estimateExpenditure,
  projectDate,
  suggestCalorieTarget,
  weeklyRate,
  weighInStreak,
} from "./calc";
import { addDays } from "./dates";

const daily = (start: string, n: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), weight: f(i) }));

describe("computeTrend", () => {
  it("starts at the first weigh-in and smooths noise", () => {
    const t = computeTrend(daily("2026-01-01", 30, (i) => 200 + (i % 2 ? 1 : -1)));
    expect(t[0].trend).toBe(199);
    expect(Math.abs(t[29].trend - 200)).toBeLessThan(0.6);
  });

  it("catches up after a long gap instead of lagging", () => {
    const t = computeTrend([
      { date: "2026-05-09", weight: 211 },
      { date: "2026-05-16", weight: 204 },
      { date: "2026-06-13", weight: 194 },
    ]);
    expect(t[2].trend).toBeLessThan(195);
  });
});

describe("weeklyRate", () => {
  it("recovers a steady 1 lb/week loss", () => {
    const t = computeTrend(daily("2026-01-01", 60, (i) => 200 - i / 7));
    expect(weeklyRate(t, "2026-03-01")).toBeCloseTo(-1, 1);
  });

  it("returns null with too little data", () => {
    const t = computeTrend(daily("2026-01-01", 2, () => 200));
    expect(weeklyRate(t, "2026-01-02")).toBeNull();
  });
});

describe("projectDate", () => {
  it("projects from the rate", () => {
    expect(projectDate(180, 175, -1, "2026-01-01")).toBe("2026-02-05");
  });
  it("gives no date when not losing", () => {
    expect(projectDate(180, 175, 0.2, "2026-01-01")).toBeNull();
  });
});

describe("estimateExpenditure", () => {
  it("derives expenditure from intake and trend", () => {
    // Eating 2000 kcal and losing 1 lb/week implies burning ~2500.
    const points = computeTrend(daily("2026-01-01", 40, (i) => 200 - i / 7));
    const today = "2026-02-09";
    const cals = new Map(
      Array.from({ length: 28 }, (_, i) => [addDays(today, -i - 1), 2000] as const),
    );
    const e = estimateExpenditure({ points, dailyCalories: cals, today, formula: 2400 });
    expect(e.source).toBe("adaptive");
    expect(e.kcal).toBeGreaterThan(2440);
    expect(e.kcal).toBeLessThan(2560);
    expect(e.confidence).toBe("high");
  });

  it("falls back to the formula without enough logged days", () => {
    const points = computeTrend(daily("2026-01-01", 40, (i) => 200 - i / 7));
    const e = estimateExpenditure({
      points,
      dailyCalories: new Map([["2026-02-01", 2000]]),
      today: "2026-02-09",
      formula: 2400,
    });
    expect(e.source).toBe("formula");
    expect(e.kcal).toBe(2400);
  });

  it("ignores partially logged days", () => {
    const points = computeTrend(daily("2026-01-01", 40, (i) => 200 - i / 7));
    const today = "2026-02-09";
    const cals = new Map(
      Array.from({ length: 10 }, (_, i) => [addDays(today, -i - 1), 400] as const),
    );
    const e = estimateExpenditure({ points, dailyCalories: cals, today, formula: 2400 });
    expect(e.source).toBe("formula");
  });
});

describe("targets and body maths", () => {
  it("never suggests below the safety floor", () => {
    expect(suggestCalorieTarget(1800, 2, "male")).toBe(1500);
    expect(suggestCalorieTarget(2500, 1, "male")).toBe(2000);
  });
  it("computes BMI and BMR", () => {
    expect(bmi(176.6, 68)).toBe(26.8);
    expect(bmr({ weightLb: 176.6, heightIn: 68, age: 30, sex: "male" })).toBeGreaterThan(1600);
  });
});

describe("buildMilestones", () => {
  it("marks reached steps and projects the rest", () => {
    const points = computeTrend(daily("2026-01-01", 50, (i) => 200 - i / 7));
    const ms = buildMilestones({
      startWeight: 200,
      goalWeight: 180,
      heightIn: 60,
      points,
      rate: -1,
      today: "2026-02-19",
    });
    expect(ms.map((m) => m.weight)).toEqual([195, 190, 185, 180]);
    expect(ms[0].achievedOn).not.toBeNull();
    expect(ms[1].achievedOn).toBeNull();
    expect(ms[1].projectedOn).not.toBeNull();
    expect(ms[3].label).toBe("Goal weight");
  });
});

describe("weighInStreak", () => {
  it("counts back from today or yesterday", () => {
    expect(weighInStreak(["2026-01-03", "2026-01-02", "2026-01-01"], "2026-01-03")).toBe(3);
    expect(weighInStreak(["2026-01-02", "2026-01-01"], "2026-01-03")).toBe(2);
    expect(weighInStreak(["2026-01-01"], "2026-01-03")).toBe(0);
  });
});
