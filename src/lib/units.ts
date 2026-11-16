/**
 * Display units. Everything is stored in pounds, ounces and inches; these
 * helpers convert at the edges, for what's shown and what's typed in.
 */
import { num } from "./utils";

export type Units = "imperial" | "metric";

export const KG_PER_LB = 0.45359237;
export const ML_PER_OZ = 29.5735295625;
export const CM_PER_IN = 2.54;

export const weightUnit = (u: Units) => (u === "metric" ? "kg" : "lb");
export const waterUnit = (u: Units) => (u === "metric" ? "ml" : "oz");

/** Pounds to the display unit, unrounded. */
export const toWeight = (lb: number, u: Units) => (u === "metric" ? lb * KG_PER_LB : lb);
/** A typed weight in the display unit back to pounds. */
export const fromWeight = (v: number, u: Units) => (u === "metric" ? v / KG_PER_LB : v);

/** "176.4 lb" / "80 kg". Changes (signed) use the same scale. */
export function formatWeight(lb: number | null | undefined, u: Units, digits = 1): string {
  if (lb === null || lb === undefined) return "–";
  return `${num(toWeight(lb, u), digits)} ${weightUnit(u)}`;
}

/** Display number only, e.g. for big figures with the unit set separately. */
export const weightNum = (lb: number | null | undefined, u: Units, digits = 1) =>
  lb === null || lb === undefined ? "–" : num(toWeight(lb, u), digits);

/** Ounces to the display unit: whole ounces, or millilitres to the nearest 10. */
export function toWater(oz: number, u: Units): number {
  return u === "metric" ? Math.round((oz * ML_PER_OZ) / 10) * 10 : Math.round(oz);
}
export const fromWater = (v: number, u: Units) => (u === "metric" ? v / ML_PER_OZ : v);
export const formatWater = (oz: number, u: Units) => `${toWater(oz, u).toLocaleString("en-US")} ${waterUnit(u)}`;

/** Quick-add amounts for the water card, in display units. */
export const waterQuickAdds = (u: Units) => (u === "metric" ? [250, 350, 500, 750] : [8, 12, 16, 24]);

export const toCm = (inches: number) => inches * CM_PER_IN;
export const fromCm = (cm: number) => cm / CM_PER_IN;
