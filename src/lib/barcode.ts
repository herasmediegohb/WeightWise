import type { BarcodeProduct } from "@/db/schema";

/** EAN-8, UPC-A (12), EAN-13 and GTIN-14 are all digits only. */
export function normalizeBarcode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "");
  return /^\d{8,14}$/.test(code) ? code : null;
}

type Nutriments = Record<string, number | string | undefined>;
type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutriments?: Nutriments;
};

function n(v: number | string | undefined): number | null {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

function energyKcal(nut: Nutriments, suffix: "100g" | "serving"): number | null {
  const direct = n(nut[`energy-kcal_${suffix}`]);
  if (direct !== null) return direct;
  // Some products only list energy in kilojoules.
  const kj = n(nut[`energy-kj_${suffix}`]) ?? n(nut[`energy_${suffix}`]);
  return kj === null ? null : kj / 4.184;
}

/**
 * Turns an Open Food Facts product into what the app needs. Returns null
 * when the product has no usable calorie information.
 */
export function parseOffProduct(code: string, p: OffProduct | undefined | null): BarcodeProduct | null {
  if (!p) return null;
  const nut = p.nutriments ?? {};
  const cal100 = energyKcal(nut, "100g");
  const calServ = energyKcal(nut, "serving");
  if (cal100 === null && calServ === null) return null;

  const servingGramsRaw = n(p.serving_quantity);
  const unit = (p.serving_quantity_unit ?? "g").toLowerCase();
  const servingGrams = servingGramsRaw !== null && servingGramsRaw > 0 && (unit === "g" || unit === "ml") ? servingGramsRaw : null;

  const macro = (key: string, suffix: "100g" | "serving") => n(nut[`${key}_${suffix}`]) ?? 0;
  let per100g = cal100 === null ? null : {
    calories: cal100,
    proteinG: macro("proteins", "100g"),
    carbsG: macro("carbohydrates", "100g"),
    fatG: macro("fat", "100g"),
  };
  let perServing = calServ === null ? null : {
    calories: calServ,
    proteinG: macro("proteins", "serving"),
    carbsG: macro("carbohydrates", "serving"),
    fatG: macro("fat", "serving"),
  };
  // Fill whichever side is missing when the serving weight is known.
  if (!perServing && per100g && servingGrams) perServing = scale(per100g, servingGrams / 100);
  if (!per100g && perServing && servingGrams) per100g = scale(perServing, 100 / servingGrams);
  if (!per100g) {
    // Only per-serving data and no serving weight: treat a serving as the unit.
    return {
      code,
      name: productName(p),
      brand: brand(p),
      servingLabel: p.serving_size?.trim() || "1 serving",
      servingGrams: null,
      per100g: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      perServing: round(perServing!),
    };
  }
  return {
    code,
    name: productName(p),
    brand: brand(p),
    servingLabel: p.serving_size?.trim() || null,
    servingGrams,
    per100g: round(per100g),
    perServing: perServing ? round(perServing) : null,
  };
}

function productName(p: OffProduct): string {
  return (p.product_name || p.product_name_en || p.generic_name || "Unnamed product").trim().slice(0, 120);
}

function brand(p: OffProduct): string | null {
  return p.brands?.split(",")[0]?.trim() || null;
}

type Macros = { calories: number; proteinG: number; carbsG: number; fatG: number };

export function scale(m: Macros, f: number): Macros {
  return { calories: m.calories * f, proteinG: m.proteinG * f, carbsG: m.carbsG * f, fatG: m.fatG * f };
}

function round(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    proteinG: Math.round(m.proteinG * 10) / 10,
    carbsG: Math.round(m.carbsG * 10) / 10,
    fatG: Math.round(m.fatG * 10) / 10,
  };
}

/** Nutrition for an amount: either a number of servings or grams. */
export function nutritionFor(
  p: BarcodeProduct,
  amount: { mode: "serving" | "grams"; value: number },
): Macros {
  if (amount.mode === "serving") {
    const base = p.perServing ?? (p.servingGrams ? scale(p.per100g, p.servingGrams / 100) : p.per100g);
    return scale(base, amount.value);
  }
  return scale(p.per100g, amount.value / 100);
}

