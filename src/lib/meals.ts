export const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
] as const;

export type Meal = (typeof MEALS)[number]["value"];

export function mealForHour(hour: number): Meal {
  if (hour < 10.5) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 17) return "snack";
  if (hour < 21.5) return "dinner";
  return "snack";
}
