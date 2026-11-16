import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { FoodDay } from "@/components/food-day";
import { Bar, Card, Ring } from "@/components/ui";
import { aiConfigured } from "@/lib/ai";
import { getFoodForDay, getFrequentFoods, getMealsForDay, getProfile, getSavedMeals } from "@/lib/data";
import { addDays, formatShort, formatWeekday, isValidDate, relativeDay } from "@/lib/dates";
import { mealForHour } from "@/lib/meals";
import { getClock } from "@/lib/session";
import { cn, int } from "@/lib/utils";

export const metadata = { title: "Food" };

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today, hour } = await getClock();
  const sp = await searchParams;
  const date = isValidDate(sp.date) && sp.date <= today ? sp.date : today;
  const [entries, saved, frequent, previous] = await Promise.all([
    getFoodForDay(date),
    getSavedMeals(),
    getFrequentFoods(today),
    getMealsForDay(addDays(date, -1)),
  ]);

  const t = entries.reduce(
    (a, e) => ({ calories: a.calories + e.calories, proteinG: a.proteinG + e.proteinG, carbsG: a.carbsG + e.carbsG, fatG: a.fatG + e.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  const left = p.calorieTarget - t.calories;
  const over = left < 0;
  const label = relativeDay(date, today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)).filter((d) => d <= today);
  const navBtn = "grid size-11 place-items-center rounded-2xl text-fg hover:bg-surface-2";

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <header className="mb-4 flex items-center justify-between">
        <Link href={`/food?date=${addDays(date, -1)}`} aria-label="Previous day" className={cn(navBtn, "-ml-2")}>
          <CaretLeft size={20} weight="bold" />
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">{label}</h1>
          {(label === "Today" || label === "Yesterday") && <p className="text-sm text-muted">{formatShort(date)}</p>}
        </div>
        {date < today ? (
          <Link href={`/food?date=${addDays(date, 1)}`} aria-label="Next day" className={cn(navBtn, "-mr-2")}>
            <CaretRight size={20} weight="bold" />
          </Link>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </header>

      <nav aria-label="Days" className="mb-4 flex justify-center gap-1.5">
        {week.map((d) => (
          <Link
            key={d}
            href={`/food?date=${d}`}
            aria-current={d === date ? "date" : undefined}
            className={cn(
              "flex h-14 w-11 flex-col items-center justify-center rounded-2xl text-xs transition-colors",
              d === date ? "bg-lime font-semibold text-on-lime" : "text-muted hover:bg-surface-2",
            )}
          >
            <span>{formatWeekday(d)}</span>
            <span className="text-[15px] font-semibold tnum">{+d.slice(8)}</span>
          </Link>
        ))}
      </nav>

      <Card className="mb-4">
        <div className="flex items-center gap-5">
          <Ring
            value={t.calories / p.calorieTarget}
            size={112}
            stroke={11}
            color={over ? "var(--warn)" : "var(--accent)"}
            label={`${int(t.calories)} of ${int(p.calorieTarget)} calories eaten`}
          >
            <div>
              <p className={cn("display text-2xl font-semibold", over && "text-warn")}>{int(Math.abs(left))}</p>
              <p className="mt-1 text-xs text-muted">{over ? "kcal over" : "kcal left"}</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm text-muted tnum">
              <span className="text-base font-semibold text-fg">{int(t.calories)}</span> of {int(p.calorieTarget)} kcal eaten
            </p>
            <div>
              <div className="mb-1.5 flex justify-between text-sm tnum">
                <span className="font-medium">Protein</span>
                <span className="text-muted">
                  <span className="font-semibold text-fg">{int(t.proteinG)}</span> / {p.proteinTargetG} g
                </span>
              </div>
              <Bar value={t.proteinG / p.proteinTargetG} color="var(--protein)" label={`${int(t.proteinG)} of ${p.proteinTargetG} grams of protein`} />
            </div>
            <p className="text-sm text-muted tnum">
              Carbs <span className="font-semibold text-fg">{int(t.carbsG)} g</span>
              <span className="mx-2" aria-hidden>·</span>
              Fat <span className="font-semibold text-fg">{int(t.fatG)} g</span>
            </p>
          </div>
        </div>
      </Card>

      <FoodDay
        date={date}
        dateLabel={label}
        entries={entries.map((e) => ({ id: e.id, meal: e.meal, name: e.name, quantity: e.quantity, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG }))}
        defaultMeal={date === today ? mealForHour(hour) : "breakfast"}
        quick={{ saved: saved.map((m) => ({ id: m.id, name: m.name, items: m.items })), frequent, previous }}
        previousDate={addDays(date, -1)}
        aiEnabled={aiConfigured()}
      />
    </div>
  );
}
