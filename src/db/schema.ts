import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export type FoodItem = {
  name: string;
  quantity: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type CheckinStats = {
  weekStart: string;
  weekEnd: string;
  trendStart: number | null;
  trendEnd: number | null;
  trendChange: number | null;
  weighIns: number;
  avgCalories: number | null;
  avgProtein: number | null;
  daysLogged: number;
  avgWaterOz: number | null;
  expenditure: number | null;
  expenditureSource: "adaptive" | "formula";
  currentCalorieTarget: number;
  targetPace: number;
};

/** Single-user app: exactly one row, id = 1. */
export const profile = pgTable("profile", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  birthdate: date("birthdate").notNull(),
  sex: text("sex").$type<"male" | "female">().notNull(),
  heightIn: real("height_in").notNull(),
  startWeightLb: real("start_weight_lb").notNull(),
  startDate: date("start_date").notNull(),
  goalWeightLb: real("goal_weight_lb").notNull(),
  paceLbPerWeek: real("pace_lb_per_week").notNull().default(1),
  activityLevel: text("activity_level")
    .$type<"sedentary" | "light" | "moderate" | "active">()
    .notNull()
    .default("light"),
  calorieTarget: integer("calorie_target").notNull(),
  proteinTargetG: integer("protein_target_g").notNull(),
  waterTargetOz: integer("water_target_oz").notNull().default(80),
  /** Display units: imperial (lb, oz, ft/in) or metric (kg, ml, cm). Data is always stored imperial. */
  units: text("units").$type<"imperial" | "metric">().notNull().default("imperial"),
  /** Losing toward the goal, or holding at it. */
  phase: text("phase").$type<"lose" | "maintain">().notNull().default("lose"),
  /** Used to send reminders at local times. */
  timezone: text("timezone").notNull().default("UTC"),
  /** Local times "HH:MM", or null when off. */
  reminderWeighIn: text("reminder_weigh_in"),
  reminderWater: text("reminder_water"),
  notifyCheckin: boolean("notify_checkin").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weightLogs = pgTable("weight_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  weightLb: real("weight_lb").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const foodEntries = pgTable("food_entries", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  meal: text("meal").$type<"breakfast" | "lunch" | "dinner" | "snack">().notNull(),
  name: text("name").notNull(),
  quantity: text("quantity"),
  calories: real("calories").notNull(),
  proteinG: real("protein_g").notNull().default(0),
  carbsG: real("carbs_g").notNull().default(0),
  fatG: real("fat_g").notNull().default(0),
  source: text("source")
    .$type<"ai_text" | "ai_photo" | "manual" | "saved" | "barcode" | "import">()
    .notNull()
    .default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedMeals = pgTable("saved_meals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  items: jsonb("items").$type<FoodItem[]>().notNull(),
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
});

export const waterLogs = pgTable("water_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  oz: real("oz").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bodyScans = pgTable("body_scans", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  bodyFatPct: real("body_fat_pct"),
  muscleMassLb: real("muscle_mass_lb"),
  leanMassLb: real("lean_mass_lb"),
  fatMassLb: real("fat_mass_lb"),
  visceralFatLevel: real("visceral_fat_level"),
  waterPct: real("water_pct"),
  bmrKcal: real("bmr_kcal"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkins = pgTable("checkins", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull().unique(),
  stats: jsonb("stats").$type<CheckinStats>().notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  suggestedCalories: integer("suggested_calories"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small key/value store for app-wide state (push keys, scheduler heartbeat). */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  device: text("device"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per reminder sent, so each fires at most once a day. */
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    date: date("date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("reminder_log_kind_date").on(t.kind, t.date)],
);

export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  servingLabel: string | null;
  servingGrams: number | null;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
  perServing: { calories: number; proteinG: number; carbsG: number; fatG: number } | null;
};

export const barcodeProducts = pgTable("barcode_products", {
  code: text("code").primaryKey(),
  product: jsonb("product").$type<BarcodeProduct | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  reason: text("reason").$type<"weekly" | "manual" | "before-restore" | "before-delete">().notNull(),
  data: jsonb("data").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profile.$inferSelect;
export type WeightLog = typeof weightLogs.$inferSelect;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type SavedMeal = typeof savedMeals.$inferSelect;
export type BodyScan = typeof bodyScans.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
