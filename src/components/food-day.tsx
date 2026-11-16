"use client";

import { useState } from "react";
import { CopySimple, ForkKnife, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { copyDay, deleteFood, updateFood } from "@/app/actions";
import { MEALS, type Meal } from "@/lib/meals";
import { int } from "@/lib/utils";
import { FoodSheet, type QuickData } from "./food-sheet";
import { Button, Card, Empty, Field, Segmented, Sheet } from "./ui";

export type Entry = {
  id: number;
  meal: Meal;
  name: string;
  quantity: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function FoodDay({
  date,
  dateLabel,
  entries,
  defaultMeal,
  quick,
  previousDate,
  aiEnabled,
}: {
  date: string;
  dateLabel: string;
  entries: Entry[];
  defaultMeal: Meal;
  quick: QuickData;
  /** The day before `date`, offered as "copy all" when this day is empty. */
  previousDate: string;
  aiEnabled: boolean;
}) {
  const [addMeal, setAddMeal] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [copying, setCopying] = useState(false);

  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setAddMeal(defaultMeal)}>
        <Plus size={18} weight="bold" aria-hidden />
        Log food
      </Button>

      {entries.length === 0 ? (
        <Card className="mt-4">
          <Empty
            icon={<ForkKnife size={24} />}
            title="Nothing logged for this day"
            body={aiEnabled ? "Describe a meal, scan a barcode or take a photo, and the app works out the calories and macros." : "Add what you ate to track calories and protein against your targets."}
            action={
              quick.previous.length > 0 ? (
                <Button
                  variant="secondary"
                  loading={copying}
                  onClick={async () => {
                    setCopying(true);
                    const res = await copyDay(previousDate, date);
                    setCopying(false);
                    if (!res.ok) return toast.error(res.error);
                    toast.success(`Copied ${res.count} item${res.count === 1 ? "" : "s"}, ${int(res.calories)} kcal`);
                  }}
                >
                  <CopySimple size={18} aria-hidden />
                  Copy the day before ({int(quick.previous.reduce((a, m) => a + m.calories, 0))} kcal)
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {MEALS.map((m) => {
            const rows = entries.filter((e) => e.meal === m.value);
            if (!rows.length) return null;
            const kcal = rows.reduce((a, r) => a + r.calories, 0);
            return (
              <Card key={m.value} className="p-0">
                <div className="flex items-center justify-between px-5 pb-2 pt-4">
                  <h2 className="font-semibold">{m.label}</h2>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted tnum">{int(kcal)} kcal</span>
                    <button
                      type="button"
                      aria-label={`Add food to ${m.label}`}
                      onClick={() => setAddMeal(m.value)}
                      className="-mr-2 grid size-11 place-items-center rounded-2xl text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <Plus size={18} weight="bold" />
                    </button>
                  </div>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="flex min-h-14 w-full items-center gap-3 px-5 py-2.5 text-left transition-colors last:rounded-b-3xl hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="block truncate text-sm text-muted tnum">
                            {r.quantity ? `${r.quantity} · ` : ""}P {int(r.proteinG)} · C {int(r.carbsG)} · F {int(r.fatG)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tnum">{int(r.calories)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <FoodSheet
        open={addMeal !== null}
        onOpenChange={(o) => !o && setAddMeal(null)}
        date={date}
        dateLabel={dateLabel}
        defaultMeal={addMeal ?? defaultMeal}
        quick={quick}
        aiEnabled={aiEnabled}
      />
      <EditSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function EditSheet({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  return (
    <Sheet open={entry !== null} onOpenChange={(o) => !o && onClose()} title="Edit food">
      {entry && <EditForm key={entry.id} entry={entry} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [f, setF] = useState({
    name: entry.name,
    quantity: entry.quantity ?? "",
    calories: String(Math.round(entry.calories)),
    proteinG: String(Math.round(entry.proteinG)),
    carbsG: String(Math.round(entry.carbsG)),
    fatG: String(Math.round(entry.fatG)),
  });
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy("save");
        const res = await updateFood({
          id: entry.id,
          meal,
          name: f.name,
          quantity: f.quantity,
          calories: Number(f.calories),
          proteinG: Number(f.proteinG) || 0,
          carbsG: Number(f.carbsG) || 0,
          fatG: Number(f.fatG) || 0,
        });
        setBusy(null);
        if (!res.ok) return toast.error(res.error);
        toast.success("Food updated");
        onClose();
      }}
    >
      <Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.value, label: m.label }))} />
      <Field label="Food" value={f.name} onChange={set("name")} />
      <Field label="Portion" value={f.quantity} onChange={set("quantity")} placeholder="Optional" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories" type="number" inputMode="numeric" suffix="kcal" value={f.calories} onChange={set("calories")} />
        <Field label="Protein" type="number" inputMode="decimal" suffix="g" value={f.proteinG} onChange={set("proteinG")} />
        <Field label="Carbs" type="number" inputMode="decimal" suffix="g" value={f.carbsG} onChange={set("carbsG")} />
        <Field label="Fat" type="number" inputMode="decimal" suffix="g" value={f.fatG} onChange={set("fatG")} />
      </div>
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="danger"
          size="lg"
          loading={busy === "delete"}
          disabled={busy !== null}
          onClick={async () => {
            setBusy("delete");
            await deleteFood(entry.id);
            setBusy(null);
            toast.success("Food deleted");
            onClose();
          }}
        >
          Delete
        </Button>
        <Button type="submit" size="lg" className="flex-1" loading={busy === "save"} disabled={busy !== null}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
