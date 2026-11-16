# WeightWise

A personal weight, nutrition and hydration tracker with an AI coach. Single user, mobile first, installable as a web app.

## What it does

- **Weight**: quick daily entry, a smoothed trend line that tolerates gaps, weekly rate, projected goal date, and automatic milestones every 5 lb and at BMI boundaries.
- **Food**: describe a meal or photograph it (or a nutrition label) and the AI estimates calories, protein, carbs and fat. Estimates are editable before saving. Scan barcodes of packaged food (Open Food Facts). The Quick tab copies yesterday's meals and lists saved meals and your usual foods.
- **Water**: quick-add tracker on the home screen with a daily target.
- **Energy**: daily expenditure worked out from logged intake and the weight trend once 7 full days of food are logged; a formula estimate before that.
- **Coach**: a weekly check-in that reviews the week and proposes a calorie target, plus a chat that can see your logs.
- **Body composition**: InBody-style scan entry with change since the previous scan.
- **Reminders**: push notifications for weighing in and water, only when still needed, and a Monday check-in created automatically.
- **Maintenance**: once the goal is reached, hold it within 1.5 lb with gradually raised calories.
- **Units**: lb, oz and ft/in, or kg, ml and cm.
- **Data**: CSV import from Base44 exports, weekly backups (optionally copied off-site to Vercel Blob), restore, full JSON export, and delete-everything.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, Drizzle ORM on Postgres, Recharts, and the Anthropic SDK.

## Run locally

```bash
npm install
```

```bash
npm run dev
```

No setup is needed: without `DATABASE_URL` the app uses an embedded Postgres stored in `./.data`, and without `APP_PASSWORD` sign-in is skipped in development. AI features stay off until `ANTHROPIC_API_KEY` is set (copy `.env.example` to `.env.local`).

```bash
npm test
```

## Deploy to Vercel

1. Create a Postgres database (Supabase or Neon free tier). Copy its **pooled** connection string.
2. Import this repository in Vercel.
3. Add environment variables in the Vercel project:
   - `DATABASE_URL`: the connection string
   - `APP_PASSWORD`: the password you will sign in with
   - `ANTHROPIC_API_KEY`: from the Anthropic Console (optional, enables AI)
4. Deploy. The build applies database migrations automatically.
5. Open the site, sign in, and complete onboarding. Import your Base44 CSV exports on the second onboarding step or later from Settings.

To install on a phone, open the site in Safari or Chrome and choose **Add to Home Screen**.

### Reminders, Monday check-ins and weekly backups

These run from a scheduler that calls the app every 5 minutes. On Supabase it's free and set up from the app:

1. Open WeightWise from its Vercel address, go to **Settings → Reminders** and click **Set up scheduler**. This switches on Supabase's `pg_cron` and `pg_net` extensions and schedules the call.
2. If that fails, the app shows SQL to paste into Supabase's **SQL Editor** instead.
3. On each device: tap **Turn on notifications**. On iPhone, add the app to the Home Screen first and open it from there.

The scheduler authenticates with a token derived from `APP_PASSWORD`. If you change the password, click **Set up scheduler** again.

### Off-site backup copies (optional)

In Vercel, open the project → **Storage** → create a **Blob** store and connect it to the project, then redeploy. Weekly backups are then also saved privately there, outside the database.

## Project layout

- `src/lib/calc.ts`: all the maths (trend, rate, projections, milestones, expenditure), covered by `calc.test.ts`
- `src/db/schema.ts`: database tables; run `npm run db:generate` after changing it
- `src/app/actions.ts`: every data mutation
- `src/app/api/`: AI routes (food analysis, chat, check-in), barcode lookup, the scheduler tick, backups and export
- `src/lib/units.ts`: display-unit conversion (data is always stored in lb, oz and inches)
- `src/app/(app)/`: the five screens
