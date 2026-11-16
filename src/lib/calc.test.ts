import { describe, expect, it } from "vitest";
import {
  maintenanceStatus,
  suggestTarget,
  bodyFatPlan,
  rateRange,
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
      range: { rate: -1, fast: -1.2, slow: -0.8, confidence: "high", weighIns: 50 },
      today: "2026-02-19",
    });
    expect(ms.map((m) => m.weight)).toEqual([195, 190, 185, 180]);
    expect(ms[0].achievedOn).not.toBeNull();
    expect(ms[1].achievedOn).toBeNull();
    expect(ms[1].projectedOn).not.toBeNull();
    expect(ms[1].early! < ms[1].projectedOn!).toBe(true);
    expect(ms[1].late! > ms[1].projectedOn!).toBe(true);
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

describe("rateRange", () => {
  it("is narrow and confident for steady daily weigh-ins", () => {
    const pts = computeTrend(daily("2026-01-01", 40, (i) => 200 - i / 7 + (i % 2 ? 0.3 : -0.3)));
    const r = rateRange(pts, "2026-02-09")!;
    expect(r.rate).toBeCloseTo(-1, 0);
    expect(r.confidence).toBe("high");
    expect(r.slow - r.fast).toBeLessThan(0.6);
    expect(r.fast).toBeLessThan(r.rate);
    expect(r.slow).toBeGreaterThan(r.rate);
  });

  it("is wide and low-confidence for a few noisy weigh-ins", () => {
    const pts = computeTrend([
      { date: "2026-01-01", weight: 200 },
      { date: "2026-01-09", weight: 201.5 },
      { date: "2026-01-20", weight: 198 },
      { date: "2026-01-27", weight: 199.6 },
    ]);
    const r = rateRange(pts, "2026-01-28")!;
    expect(r.confidence).toBe("low");
    expect(r.slow - r.fast).toBeGreaterThan(1);
  });

  it("returns null without enough data", () => {
    expect(rateRange(computeTrend([{ date: "2026-01-01", weight: 200 }]), "2026-01-02")).toBeNull();
  });
});

describe("bodyFatPlan", () => {
  const points = computeTrend(daily("2026-09-01", 60, (i) => 182 - i / 10));
  const range = { rate: -0.7, fast: -0.9, slow: -0.5, confidence: "medium" as const, weighIns: 60 };

  it("uses measured lean mass and finds the weight for each target", () => {
    const plan = bodyFatPlan({
      scan: { date: "2026-09-07", bodyFatPct: 30, leanMassLb: 128.08 },
      points,
      currentTrend: 176.6,
      range,
      today: "2026-10-30",
    })!;
    expect(plan.leanSource).toBe("measured");
    expect(plan.estimatedPct).toBeCloseTo(27.5, 0);
    expect(plan.milestones.map((m) => m.pct)).toEqual([25, 20, 18, 15]);
    expect(plan.milestones[1].weight).toBeCloseTo(160.1, 1); // 128.08 / 0.8
    expect(plan.milestones[1].date).not.toBeNull();
  });

  it("derives lean mass from body fat and the trend when lean mass wasn't measured", () => {
    const plan = bodyFatPlan({
      scan: { date: "2026-10-03", bodyFatPct: 27.7, leanMassLb: null },
      points,
      currentTrend: 176.6,
      range,
      today: "2026-10-30",
    })!;
    expect(plan.leanSource).toBe("derived");
    expect(plan.milestones[0].pct).toBe(25);
  });

  it("marks targets already passed as reached", () => {
    const plan = bodyFatPlan({
      scan: { date: "2026-09-07", bodyFatPct: 30, leanMassLb: 128.08 },
      points,
      currentTrend: 170,
      range,
      today: "2026-10-30",
    })!;
    expect(plan.milestones[0].reached).toBe(true); // 25% is at 170.8 lb
  });

  it("needs a scan with body fat", () => {
    expect(bodyFatPlan({ scan: null, points, currentTrend: 176, range, today: "2026-10-30" })).toBeNull();
  });
});

describe("maintenance", () => {
  const base = { phase: "maintain" as const, expenditure: 2400, paceLbPerWeek: 1, sex: "male" as const, goalWeightLb: 165 };
  it("steps up gradually from a deficit", () => {
    expect(suggestTarget({ ...base, currentTrend: 165, currentTarget: 1900 })).toBe(2050);
    expect(suggestTarget({ ...base, currentTrend: 165, currentTarget: 2350 })).toBe(2400);
  });
  it("trims when above the band and adds when below", () => {
    expect(suggestTarget({ ...base, currentTrend: 167.2, currentTarget: 2400 })).toBe(2150);
    expect(suggestTarget({ ...base, currentTrend: 163, currentTarget: 2400 })).toBe(2550);
  });
  it("uses the pace when losing", () => {
    expect(suggestTarget({ ...base, phase: "lose", currentTrend: 170, currentTarget: 1900 })).toBe(1900);
  });
  it("reports where the trend sits against the band", () => {
    expect(maintenanceStatus(165.9, 165).state).toBe("in");
    expect(maintenanceStatus(167, 165)).toMatchObject({ state: "above", offBy: 0.5 });
  });
});
