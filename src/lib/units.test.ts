import { describe, expect, it } from "vitest";
import { buildMilestones, computeTrend } from "./calc";
import { addDays } from "./dates";
import { formatWater, formatWeight, fromWater, parseWeightInput, toWater, weightInputValue } from "./units";

describe("units", () => {
  it("formats weight in either unit", () => {
    expect(formatWeight(176.6, "imperial")).toBe("176.6 lb");
    expect(formatWeight(176.6, "metric")).toBe("80.1 kg");
  });

  it("round-trips a typed kg weight to pounds and back", () => {
    const r = parseWeightInput("80.1", "metric");
    expect("lb" in r && Math.abs(r.lb - 176.59) < 0.01).toBe(true);
    if ("lb" in r) expect(weightInputValue(r.lb, "metric")).toBe("80.1");
  });

  it("validates ranges in the display unit", () => {
    expect(parseWeightInput("20", "metric")).toEqual({ error: "Enter a weight between 23 and 363 kg." });
    expect(parseWeightInput("45", "imperial")).toEqual({ error: "Enter a weight between 50 and 800 lb." });
  });

  it("converts water to rounded millilitres", () => {
    expect(toWater(80, "metric")).toBe(2370);
    expect(formatWater(80, "imperial")).toBe("80 oz");
    expect(Math.round(fromWater(500, "metric") * 10) / 10).toBe(16.9);
  });

  it("places metric milestones on round kilograms", () => {
    const points = computeTrend(Array.from({ length: 20 }, (_, i) => ({ date: addDays("2026-01-01", i), weight: 211 - i })));
    const ms = buildMilestones({
      startWeight: 211,
      goalWeight: 165,
      heightIn: 68,
      points,
      range: null,
      today: "2026-01-20",
      units: "metric",
    });
    const labels = ms.filter((m) => m.label.endsWith("kg")).map((m) => m.label);
    expect(labels[0]).toBe("94 kg"); // 211 lb = 95.7 kg
    expect(labels.at(-1)).toBe("76 kg"); // goal 165 lb = 74.8 kg
    expect(ms.at(-1)!.detail).toBe("74.8 kg");
  });
});
