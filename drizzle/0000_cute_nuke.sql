CREATE TABLE "body_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"body_fat_pct" real,
	"muscle_mass_lb" real,
	"lean_mass_lb" real,
	"fat_mass_lb" real,
	"visceral_fat_level" real,
	"water_pct" real,
	"bmr_kcal" real,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_scans_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"stats" jsonb NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"suggested_calories" integer,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"meal" text NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"calories" real NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"carbs_g" real DEFAULT 0 NOT NULL,
	"fat_g" real DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"birthdate" date NOT NULL,
	"sex" text NOT NULL,
	"height_in" real NOT NULL,
	"start_weight_lb" real NOT NULL,
	"start_date" date NOT NULL,
	"goal_weight_lb" real NOT NULL,
	"pace_lb_per_week" real DEFAULT 1 NOT NULL,
	"activity_level" text DEFAULT 'light' NOT NULL,
	"calorie_target" integer NOT NULL,
	"protein_target_g" integer NOT NULL,
	"water_target_oz" integer DEFAULT 80 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"oz" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"weight_lb" real NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_logs_date_unique" UNIQUE("date")
);
