import { describe, expect, it } from "vitest";
import { normalizeBarcode, nutritionFor, parseOffProduct } from "./barcode";

const spread = {
  product_name: "Hazelnut spread",
  brands: "Example Brand, Other",
  serving_size: "15 g",
  serving_quantity: 15,
  nutriments: {
    "energy-kcal_100g": 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
  },
};

describe("normalizeBarcode", () => {
  it("accepts retail codes and strips spaces", () => {
    expect(normalizeBarcode("3017 6240 10701")).toBe("3017624010701");
    expect(normalizeBarcode("12345678")).toBe("12345678");
  });
  it("rejects anything else", () => {
    expect(normalizeBarcode("abc")).toBeNull();
    expect(normalizeBarcode("123")).toBeNull();
  });
});

describe("parseOffProduct", () => {
  it("reads per-100 g values and derives the serving", () => {
    const p = parseOffProduct("1", spread)!;
    expect(p.name).toBe("Hazelnut spread");
    expect(p.brand).toBe("Example Brand");
    expect(p.per100g.calories).toBe(539);
    expect(p.servingGrams).toBe(15);
    expect(p.perServing!.calories).toBe(81);
  });

  it("converts kilojoules when kcal is missing", () => {
    const p = parseOffProduct("1", { product_name: "Oats", nutriments: { "energy-kj_100g": 1556, proteins_100g: 13 } })!;
    expect(p.per100g.calories).toBe(372);
  });

  it("handles per-serving-only data without a serving weight", () => {
    const p = parseOffProduct("1", {
      product_name: "Bar",
      serving_size: "1 bar",
      nutriments: { "energy-kcal_serving": 210, proteins_serving: 20 },
    })!;
    expect(p.perServing!.calories).toBe(210);
    expect(nutritionFor(p, { mode: "serving", value: 2 }).proteinG).toBe(40);
  });

  it("returns null without calories", () => {
    expect(parseOffProduct("1", { product_name: "Water", nutriments: {} })).toBeNull();
    expect(parseOffProduct("1", null)).toBeNull();
  });
});

describe("nutritionFor", () => {
  it("scales by grams and by servings", () => {
    const p = parseOffProduct("1", spread)!;
    expect(nutritionFor(p, { mode: "grams", value: 30 }).calories).toBeCloseTo(161.7, 1);
    expect(nutritionFor(p, { mode: "serving", value: 2 }).calories).toBe(162);
  });
});
