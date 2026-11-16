import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Flag, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { desc, eq } from "drizzle-orm";
import { NutritionCard } from "@/components/nutrition-card";
import { GoalReachedCard } from "@/components/phase-cards";
import { maintenanceStatus } from "@/lib/calc";
import { Card, Eyebrow } from "@/components/ui";
import { WaterCard } from "@/components/water-card";
import { WeightHero } from "@/components/weight-hero";
import { getDb, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { lastCompletedWeekStart } from "@/lib/coach";
import { getCheckins, getFrequentFoods, getMealsForDay, getOverview, getProfile, getSavedMeals } from "@/lib/data";
import { addDays, formatFull, formatLong, formatRange } from "@/lib/dates";
import { mealForHour } from "@/lib/meals";
import { getClock } from "@/lib/session";
import { formatWeight } from "@/lib/units";

export default async function TodayPage() {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today, hour } = await getClock();
  const db = await getDb();
  const [o, saved, frequent, yesterdayMeals, checkins, waterRows] = await Promise.all([
    getOverview(p, today),
    getSavedMeals(),
    getFrequentFoods(today),
    getMealsForDay(addDays(today, -1)),
    getCheckins(1),
    db.select().from(schema.waterLogs).where(eq(schema.waterLogs.date, today)).orderBy(desc(schema.waterLogs.id)),
  ]);

  const totals = o.totals.get(today) ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const water = waterRows.reduce((a, r) => a + r.oz, 0);
  const todayLog = o.weights.find((w) => w.date === today) ?? null;
  const previous = o.weights.filter((w) => w.date < today).at(-1) ?? null;
  const recent = o.points.filter((pt) => pt.date >= addDays(today, -60));
  const maintaining = p.phase === "maintain";
  const maintenance = maintaining ? maintenanceStatus(o.currentTrend, p.goalWeightLb) : null;
  const reachedGoal = !maintaining && o.points.length > 0 && o.currentTrend <= p.goalWeightLb;
  const next = maintaining || reachedGoal ? null : (o.milestones.find((m) => !m.achievedOn) ?? null);
  const reached = o.milestones.filter((m) => m.achievedOn).length;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const checkinDue = checkins[0]?.weekStart !== lastCompletedWeekStart(today) && o.points.length >= 3;

  const nudge = checkinDue
    ? { title: "Your weekly check-in is ready", body: "See how last week went and whether your calorie target still fits.", href: "/coach" }
    : o.stalled
      ? { title: "Your trend has been flat for two weeks", body: "Ask the coach to look at what the data says.", href: `/coach?ask=${encodeURIComponent("Why has my weight stalled?")}` }
      : { title: "Need a meal idea?", body: "Get options that fit the calories and protein you have left today.", href: `/coach?ask=${encodeURIComponent("Give me meal ideas for what I have left today.")}` };

  return (
    <div>
      <header className="mb-5">
        <p className="text-sm text-muted">{formatLong(today)}</p>
        <h1 className="mt-0.5 text-3xl font-semibold tracking-tight">
          {greeting}, {p.name.split(" ")[0]}
        </h1>
      </header>

      <div className="rise grid gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
        <WeightHero
          today={today}
          latest={o.latest}
          todayLog={todayLog && { id: todayLog.id, weightLb: todayLog.weightLb, note: todayLog.note }}
          previous={previous && { date: previous.date, weightLb: previous.weightLb }}
          recent={recent.length >= 2 ? recent : o.points.slice(-12)}
          rate={o.rate}
          lost={o.lost}
          remaining={o.remaining}
          progress={o.progress}
          startWeight={p.startWeightLb}
          goalWeight={p.goalWeightLb}
          maintenance={maintenance}
          units={p.units}
        />
        <WaterCard date={today} total={water} target={p.waterTargetOz} lastOz={waterRows[0]?.oz ?? null} units={p.units} />
        <NutritionCard
          date={today}
          eaten={totals.calories}
          protein={totals.proteinG}
          carbs={totals.carbsG}
          fat={totals.fatG}
          calorieTarget={p.calorieTarget}
          proteinTarget={p.proteinTargetG}
          defaultMeal={mealForHour(hour)}
          quick={{ saved: saved.map((m) => ({ id: m.id, name: m.name, items: m.items })), frequent, previous: yesterdayMeals }}
          aiEnabled={aiConfigured()}
        />

        <div className="grid gap-4">
          {reachedGoal && <GoalReachedCard goalLabel={formatWeight(p.goalWeightLb, p.units)} />}
          {next && (
            <Card>
              <div className="flex items-center justify-between">
                <Eyebrow className="flex items-center gap-1.5">
                  <Flag size={16} weight="fill" className="text-accent" aria-hidden />
                  Next milestone
                </Eyebrow>
                <span className="text-sm text-muted tnum">
                  {reached} of {o.milestones.length} reached
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{next.label}</p>
              <p className="mt-1 text-[15px] text-muted tnum">
                <span className="font-semibold text-fg">{formatWeight(Math.max(0, o.currentTrend - next.weight), p.units)}</span> to go
                {next.projectedOn ? `, on track for ${formatFull(next.projectedOn)}` : ""}
              </p>
              {o.goal.date && (
                <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
                  Goal weight of {formatWeight(p.goalWeightLb, p.units)} projected for{" "}
                  <span className="font-medium text-fg">{formatFull(o.goal.date)}</span>
                  {o.goal.early && <>, likely {formatRange(o.goal.early, o.goal.late)}</>}
                  {o.range && <> ({o.range.confidence} confidence)</>}.
                </p>
              )}
            </Card>
          )}

          <Link
            href={nudge.href}
            className="group flex items-center gap-4 rounded-3xl border border-border bg-surface p-5 shadow-card transition-transform active:scale-[0.99]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-on-lime" aria-hidden>
              <Sparkle size={22} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{nudge.title}</span>
              <span className="block text-sm text-muted">{nudge.body}</span>
            </span>
            <ArrowRight size={18} weight="bold" className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
