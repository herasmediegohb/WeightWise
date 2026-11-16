"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "@phosphor-icons/react";
import type { Meal } from "@/lib/meals";
import { cn, int } from "@/lib/utils";
import { FoodSheet, type QuickData } from "./food-sheet";
import { Bar, Button, Card, Eyebrow, Ring } from "./ui";

export function NutritionCard({
  date,
  eaten,
  protein,
  carbs,
  fat,
  calorieTarget,
  proteinTarget,
  defaultMeal,
  quick,
  aiEnabled,
  className,
}: {
  date: string;
  eaten: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieTarget: number;
  proteinTarget: number;
  defaultMeal: Meal;
  quick: QuickData;
  aiEnabled: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const left = calorieTarget - eaten;
  const over = left < 0;

  return (
    <Card className={className}>
      <div className="flex items-center justify-between">
        <Eyebrow>Nutrition</Eyebrow>
        <Link href="/food" className="-mr-1 flex h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted hover:text-fg">
          Food log <ArrowRight size={14} weight="bold" aria-hidden />
        </Link>
      </div>
      <div className="mt-3 flex items-center gap-5">
        <Ring
          value={eaten / calorieTarget}
          color={over ? "var(--warn)" : "var(--accent)"}
          label={`${int(eaten)} of ${int(calorieTarget)} calories eaten`}
        >
          <div>
            <p className={cn("display text-3xl font-semibold", over && "text-warn")}>{int(Math.abs(left))}</p>
            <p className="mt-1 text-xs text-muted">{over ? "kcal over" : "kcal left"}</p>
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-3.5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm tnum">
              <span className="font-medium">Protein</span>
              <span className="text-muted">
                <span className="font-semibold text-fg">{int(protein)}</span> / {proteinTarget} g
              </span>
            </div>
            <Bar value={protein / proteinTarget} color="var(--protein)" label={`${int(protein)} of ${proteinTarget} grams of protein`} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm tnum">
            {[
              ["Eaten", `${int(eaten)}`],
              ["Carbs", `${int(carbs)} g`],
              ["Fat", `${int(fat)} g`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <Button variant="secondary" size="lg" className="mt-5 w-full" onClick={() => setOpen(true)}>
        <Plus size={18} weight="bold" aria-hidden />
        Log food
      </Button>
      <FoodSheet
        open={open}
        onOpenChange={setOpen}
        date={date}
        dateLabel="Today"
        defaultMeal={defaultMeal}
        quick={quick}
        aiEnabled={aiEnabled}
      />
    </Card>
  );
}
