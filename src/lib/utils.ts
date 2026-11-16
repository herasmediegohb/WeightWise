import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1 decimal, trailing ".0" dropped: 176.6 -> "176.6", 180 -> "180". */
export function num(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const f = 10 ** digits;
  return String(Math.round(v * f) / f);
}

export function int(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return Math.round(v).toLocaleString("en-US");
}

/** Signed change with a real minus sign: -1.2 -> "−1.2", 0.4 -> "+0.4". */
export function signed(v: number, digits = 1): string {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  if (r === 0) return "0";
  return (r > 0 ? "+" : "−") + Math.abs(r);
}
