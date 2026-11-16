import { redirect } from "next/navigation";
import { CheckCircle, Circle, Fire, Target } from "@phosphor-icons/react/dist/ssr";
import { IntakeChart } from "@/components/intake-chart";
import { BodyComposition, WeighInHistory } from "@/components/progress-lists";
import { Card, Eyebrow } from "@/components/ui";
import { WeightChart } from "@/components/weight-chart";
import { MIN_COMPLETE_DAY_KCAL, bmiCategory, maintenanceStatus } from "@/lib/calc";
import { getOverview, getProfile, getScans } from "@/lib/data";
import { addDays, diffDays, formatFull, formatRange } from "@/lib/dates";
import { getClock } from "@/lib/session";
import { formatWeight, toWeight, weightNum, weightUnit } from "@/lib/units";
import { cn, int, num, signed } from "@/lib/utils";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today } = await getClock();
  const [o, scans] = await Promise.all([getOverview(p, today), getScans()]);

  const e = o.expenditure;
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = addDays(today, i - 27);
    const t = o.totals.get(date);
    return { date, calories: t ? Math.round(t.calories) : null, proteinG: t ? Math.round(t.proteinG) : null };
  });
  const history = [...o.points]
    .reverse()
    .map((pt) => {
      const w = o.weights.find((x) => x.date === pt.date)!;
      return { id: w.id, date: w.date, weightLb: w.weightLb, note: w.note, trend: pt.trend };
    });
  const u = p.units;
  const wu = weightUnit(u);
  const w = (lb: number) => formatWeight(lb, u);
  /** Signed rate or change, in display units (kg rates get two decimals). */
  const sw = (lb: number) => signed(toWeight(lb, u), u === "metric" ? 2 : 1);
  const maint = p.phase === "maintain" ? maintenanceStatus(o.currentTrend, p.goalWeightLb) : null;
  const impliedPace = ((e.kcal - p.calorieTarget) * 7) / 3500;

  const tiles = [
    { label: "Lost so far", value: w(Math.max(0, o.lost)), sub: `since ${formatFull(p.startDate)}` },
    {
      label: "Weekly rate",
      value: o.range === null ? "–" : `${sw(o.range.rate)} ${wu}`,
      sub: o.range === null ? "needs more weigh-ins" : `likely ${sw(o.range.fast)} to ${sw(o.range.slow)}, target ${sw(-p.paceLbPerWeek)}`,
    },
    { label: "BMI", value: num(o.bmi), sub: bmiCategory(o.bmi) },
    p.phase === "maintain"
      ? {
          label: "Maintenance",
          value: maint!.state === "in" ? "In range" : `${w(maint!.offBy)} ${maint!.state}`,
          sub: `range ${weightNum(maint!.low, u)} to ${w(maint!.high)}`,
        }
      : {
      label: "Goal date",
      value: o.goal.date ? formatFull(o.goal.date) : "–",
      sub: o.goal.date
        ? `likely ${formatRange(o.goal.early, o.goal.late)}`
        : "no projection at the current rate",
    },
  ];

  return (
    <div>
      <h1 className="mb-5 text-3xl font-semibold tracking-tight">Progress</h1>
      <div className="rise grid gap-4 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="display text-4xl font-semibold">{weightNum(o.currentTrend, u)}</span>
            <span className="text-muted">{wu} trend</span>
            <span className="ml-auto text-sm text-muted tnum">
              {weightNum(p.startWeightLb, u)} → {w(p.goalWeightLb)}
            </span>
          </div>
          <WeightChart points={o.points} goal={p.goalWeightLb} today={today} units={u} />
        </Card>

        <dl className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4 [&>*]:min-w-0">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-3xl border border-border bg-surface p-4 shadow-card">
              <dt className="text-[13px] font-medium text-muted">{t.label}</dt>
              <dd className="mt-1.5">
                <span className="block text-2xl font-semibold tracking-tight tnum">{t.value}</span>
                <span className="mt-0.5 block text-sm text-muted">{t.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
        {o.range && (
          <p className="-mt-1 text-sm text-muted lg:col-span-2">
            <span className={cn("font-semibold", o.range.confidence === "high" ? "text-accent" : o.range.confidence === "low" ? "text-warn" : "text-fg")}>
              {o.range.confidence[0].toUpperCase() + o.range.confidence.slice(1)} confidence
            </span>{" "}
            in these projections, from {o.range.weighIns} weigh-ins in recent weeks.
            {o.range.confidence !== "high" && " Weighing in most mornings narrows the range."}
          </p>
        )}

        <Card>
          <Eyebrow className="flex items-center gap-1.5">
            <Fire size={16} weight="fill" className="text-warn" aria-hidden />
            Energy
          </Eyebrow>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="display text-4xl font-semibold">{int(e.kcal)}</span>
            <span className="text-muted">kcal burned per day</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {e.source === "adaptive"
              ? `Worked out from ${e.daysUsed} days of logged food and how your trend weight moved over the same period. Confidence is ${e.confidence}.`
              : `A formula estimate from your height, weight, age and activity level. Log food on ${Math.max(1, 7 - e.daysUsed)} more full day${7 - e.daysUsed === 1 ? "" : "s"} and the app will work this out from your own data instead.`}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-muted">Target</dt>
              <dd className="mt-0.5 font-semibold tnum">{int(p.calorieTarget)} kcal</dd>
            </div>
            <div>
              <dt className="text-muted">Avg eaten</dt>
              <dd className="mt-0.5 font-semibold tnum">{e.avgIntake ? `${int(e.avgIntake)} kcal` : "–"}</dd>
            </div>
            <div>
              <dt className="text-muted">Target implies</dt>
              <dd className="mt-0.5 font-semibold tnum">{sw(-impliedPace)} {wu}/wk</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Calories, last 4 weeks</h2>
            <span className="text-sm text-muted tnum">{days.filter((d) => d.calories !== null).length} days logged</span>
          </div>
          <IntakeChart days={days} target={p.calorieTarget} />
          <p className="mt-2 text-xs text-muted">
            Days under {MIN_COMPLETE_DAY_KCAL} kcal count as partly logged and are left out of the energy estimate.
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <Target size={18} weight="fill" className="text-accent" aria-hidden />
              Milestones
            </h2>
            <span className="text-sm text-muted tnum">
              {o.milestones.filter((m) => m.achievedOn).length} of {o.milestones.length}
            </span>
          </div>
          <ol className="mt-4">
            {o.milestones.map((m, i) => {
              const done = Boolean(m.achievedOn);
              const isNext = !done && (i === 0 || Boolean(o.milestones[i - 1].achievedOn));
              return (
                <li key={m.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < o.milestones.length - 1 && (
                    <span className={cn("absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-0.5 rounded-full", done ? "bg-accent" : "bg-track")} aria-hidden />
                  )}
                  {done ? (
                    <CheckCircle size={24} weight="fill" className="shrink-0 text-accent" aria-hidden />
                  ) : (
                    <Circle size={24} weight={isNext ? "bold" : "regular"} className={cn("shrink-0", isNext ? "text-accent" : "text-muted/50")} aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", !done && !isNext && "text-muted")}>{m.label}</p>
                    <p className="text-sm text-muted tnum">
                      {done
                        ? `Reached ${formatFull(m.achievedOn!)}${m.achievedOn! > p.startDate ? `, day ${diffDays(m.achievedOn!, p.startDate)}` : ""}`
                        : m.projectedOn
                          ? `${w(o.currentTrend - m.weight)} to go, projected ${formatFull(m.projectedOn)}`
                          : `${w(o.currentTrend - m.weight)} to go`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="grid gap-4">
          <BodyComposition scans={scans} today={today} plan={o.bodyFat} units={u} />
          <WeighInHistory rows={history} today={today} units={u} />
        </div>
      </div>
    </div>
  );
}
