# WeightWise

A personal weight, nutrition and hydration tracker with an AI coach. Single user, mobile first, installable as a web app.

## What it does

- **Weight**: quick daily entry, a smoothed trend line that tolerates gaps, weekly rate, projected goal date, and automatic milestones every 5 lb and at BMI boundaries.
- **Food**: describe a meal or photograph it (or a nutrition label) and the AI estimates calories, protein, carbs and fat. Estimates are editable before saving. Saved meals and recent foods re-log in one tap.
- **Water**: quick-add tracker on the home screen with a daily target.
- **Energy**: daily expenditure worked out from logged intake and the weight trend once 7 full days of food are logged; a formula estimate before that.
- **Coach**: a weekly check-in that reviews the week and proposes a calorie target, plus a chat that can see your logs.
- **Body composition**: InBody-style scan entry with change since the previous scan.
- **Data**: CSV import from Base44 exports, full JSON export, and delete-everything.

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

## Project layout

- `src/lib/calc.ts`: all the maths (trend, rate, projections, milestones, expenditure), covered by `calc.test.ts`
- `src/db/schema.ts`: database tables; run `npm run db:generate` after changing it
- `src/app/actions.ts`: every data mutation
- `src/app/api/`: AI routes (food analysis, chat, check-in) and export
- `src/app/(app)/`: the five screens
