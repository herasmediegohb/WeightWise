CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"data" jsonb NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barcode_products" (
	"code" text PRIMARY KEY NOT NULL,
	"product" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_log_kind_date" UNIQUE("kind","date")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "units" text DEFAULT 'imperial' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "phase" text DEFAULT 'lose' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "reminder_weigh_in" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "reminder_water" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "notify_checkin" boolean DEFAULT true NOT NULL;