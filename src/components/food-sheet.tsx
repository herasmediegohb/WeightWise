"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookmarkSimple,
  Camera,
  ClockCounterClockwise,
  Minus,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { addFood, deleteSavedMeal } from "@/app/actions";
import type { FoodItem } from "@/db/schema";
import { MEALS, type Meal } from "@/lib/meals";
import { cn, int } from "@/lib/utils";
import { Button, Empty, Field, IconButton, Segmented, Sheet, Spinner } from "./ui";

export type SavedMealLite = { id: number; name: string; items: FoodItem[] };
export type RecentFood = FoodItem & { id: number };

type Draft = FoodItem & { key: number; servings: number };
type Tab = "describe" | "saved" | "manual";

/** Downscales a photo in the browser so uploads stay small and fast. */
async function toJpeg(file: File): Promise<{ data: string; mediaType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.slice(url.indexOf(",") + 1), mediaType: "image/jpeg", preview: url };
}

const scaled = (d: Draft): FoodItem => ({
  name: d.name,
  quantity: d.servings === 1 ? d.quantity : `${d.servings} × ${d.quantity || "serving"}`,
  calories: Math.round(d.calories * d.servings),
  proteinG: Math.round(d.proteinG * d.servings),
  carbsG: Math.round(d.carbsG * d.servings),
  fatG: Math.round(d.fatG * d.servings),
});

type FoodSheetProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  dateLabel: string;
  defaultMeal: Meal;
  saved: SavedMealLite[];
  recents: RecentFood[];
  aiEnabled: boolean;
};

/** Remounts the sheet body each time it opens, so every entry starts clean. */
export function FoodSheet(props: FoodSheetProps) {
  const [wasOpen, setWasOpen] = useState(props.open);
  const [session, setSession] = useState(0);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession(session + 1);
  }
  if (session === 0 && !props.open) return null;
  return <FoodSheetBody key={session} {...props} />;
}

function FoodSheetBody({
  open,
  onOpenChange,
  date,
  dateLabel,
  defaultMeal,
  saved,
  recents,
  aiEnabled,
}: FoodSheetProps) {
  const [tab, setTab] = useState<Tab>(aiEnabled ? "describe" : saved.length || recents.length ? "saved" : "manual");
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"ai_text" | "ai_photo">("ai_text");
  const [saveAs, setSaveAs] = useState("");
  const [wantSave, setWantSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await toJpeg(file));
      setError("");
    } catch {
      setError("That photo couldn't be read. Try a different one.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function analyze() {
    if (!text.trim() && !photo) return setError("Describe the meal or add a photo.");
    setError("");
    setAnalyzing(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/food/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          text,
          image: photo ? { data: photo.data, mediaType: photo.mediaType } : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "The estimate failed. Try again.");
      if (!json.items?.length) {
        setError(json.note || "No food was found in that. Try describing it in more detail.");
        return;
      }
      setDrafts((json.items as FoodItem[]).map((i) => ({ ...i, key: ++keyRef.current, servings: 1 })));
      setNote(json.note || "");
      setSaveAs(json.mealName || "");
      setSource(photo ? "ai_photo" : "ai_text");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof TypeError ? "You seem to be offline. Check your connection and try again." : (e as Error).message);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function log(items: FoodItem[], src: "ai_text" | "ai_photo" | "manual" | "saved", extra?: { saveAs?: string; savedMealId?: number }) {
    setSaving(true);
    const res = await addFood({ date, meal, items, source: src, ...extra });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    const kcal = items.reduce((a, i) => a + i.calories, 0);
    toast.success(`Logged ${int(kcal)} kcal to ${meal}`);
    onOpenChange(false);
  }

  function patch(key: number, p: Partial<Draft>) {
    setDrafts((ds) => ds!.map((d) => (d.key === key ? { ...d, ...p } : d)));
  }

  const totals = drafts?.map(scaled).reduce(
    (a, i) => ({ calories: a.calories + i.calories, proteinG: a.proteinG + i.proteinG, carbsG: a.carbsG + i.carbsG, fatG: a.fatG + i.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const mealPicker = (
    <Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.value, label: m.label }))} />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={drafts ? "Review estimate" : "Log food"} description={dateLabel}>
      {drafts && totals ? (
        <div>
          {mealPicker}
          {note && (
            <p className="mt-3 flex gap-2 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-sm text-fg">
              <Sparkle size={18} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {note}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => {
              const s = scaled(d);
              return (
                <li key={d.key} className="rounded-2xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="sr-only" htmlFor={`n-${d.key}`}>Food name</label>
                      <input
                        id={`n-${d.key}`}
                        value={d.name}
                        onChange={(e) => patch(d.key, { name: e.target.value })}
                        className="w-full bg-transparent text-base font-semibold focus:outline-none focus-visible:outline-none"
                      />
                      <label className="sr-only" htmlFor={`q-${d.key}`}>Portion</label>
                      <input
                        id={`q-${d.key}`}
                        value={d.quantity}
                        placeholder="Portion"
                        onChange={(e) => patch(d.key, { quantity: e.target.value })}
                        className="w-full bg-transparent text-sm text-muted focus:outline-none focus-visible:outline-none"
                      />
                    </div>
                    <IconButton label={`Remove ${d.name}`} className="-mr-1.5 -mt-1.5 text-muted" onClick={() => setDrafts((ds) => { const next = ds!.filter((x) => x.key !== d.key); return next.length ? next : null; })}>
                      <X size={18} weight="bold" />
                    </IconButton>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-0.5">
                      <IconButton label="Less" className="size-9 rounded-[10px]" disabled={d.servings <= 0.25} onClick={() => patch(d.key, { servings: Math.max(0.25, d.servings - 0.25) })}>
                        <Minus size={16} weight="bold" />
                      </IconButton>
                      <span className="w-12 text-center text-sm font-semibold tnum" aria-live="polite" aria-label={`${d.servings} servings`}>
                        {d.servings}×
                      </span>
                      <IconButton label="More" className="size-9 rounded-[10px]" onClick={() => patch(d.key, { servings: Math.min(10, d.servings + 0.25) })}>
                        <Plus size={16} weight="bold" />
                      </IconButton>
                    </div>
                    <p className="text-right text-sm tnum">
                      <span className="text-base font-semibold">{int(s.calories)}</span> <span className="text-muted">kcal</span>
                      <span className="block text-muted">
                        P {s.proteinG} · C {s.carbsG} · F {s.fatG}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <span className="font-medium">Total</span>
            <span className="text-right tnum">
              <span className="text-xl font-semibold">{int(totals.calories)}</span> <span className="text-sm text-muted">kcal</span>
              <span className="block text-sm text-muted">
                {totals.proteinG} g protein · {totals.carbsG} g carbs · {totals.fatG} g fat
              </span>
            </span>
          </div>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input type="checkbox" checked={wantSave} onChange={(e) => setWantSave(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            Save as a meal for one-tap logging
          </label>
          {wantSave && <Field label="Meal name" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} className="mt-1" />}
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => setDrafts(null)} disabled={saving}>
              Back
            </Button>
            <Button
              size="lg"
              className="flex-1"
              loading={saving}
              onClick={() => {
                if (drafts.some((d) => !d.name.trim())) return toast.error("Every food needs a name.");
                if (wantSave && !saveAs.trim()) return toast.error("Give the saved meal a name.");
                log(drafts.map(scaled), source, wantSave ? { saveAs } : undefined);
              }}
            >
              Log {int(totals.calories)} kcal
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Segmented
            label="How to log"
            value={tab}
            onChange={setTab}
            options={[
              { value: "describe", label: "Describe" },
              { value: "saved", label: "Saved" },
              { value: "manual", label: "Manual" },
            ]}
          />
          <div className="mt-3">{mealPicker}</div>

          {tab === "describe" && (
            <div className="mt-4">
              {!aiEnabled ? (
                <Empty
                  icon={<Sparkle size={24} />}
                  title="AI estimates aren't set up"
                  body="Add ANTHROPIC_API_KEY to the app's environment variables to describe or photograph meals. Manual entry works in the meantime."
                />
              ) : analyzing ? (
                <div className="flex flex-col items-center gap-3 py-10" role="status">
                  <Spinner className="size-7 text-accent" />
                  <p className="font-medium">Estimating nutrition…</p>
                  <p className="text-sm text-muted">Usually takes 5 to 15 seconds.</p>
                  <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <label htmlFor="food-text" className="mb-1.5 block text-sm font-medium">
                    What did you eat?
                  </label>
                  <textarea
                    id="food-text"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setError("");
                    }}
                    rows={3}
                    placeholder="2 scrambled eggs, a slice of sourdough with butter, black coffee"
                    aria-describedby={error ? "food-error" : "food-hint"}
                    className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base leading-relaxed placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-none"
                  />
                  <p id="food-hint" className="mt-1.5 text-sm text-muted">
                    Amounts make the estimate better. A photo of the plate or a nutrition label works too.
                  </p>
                  {photo && (
                    <div className="relative mt-3 w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.preview} alt="Meal photo to analyze" className="h-28 w-28 rounded-2xl object-cover" />
                      <IconButton label="Remove photo" onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 size-8 rounded-full border border-border bg-surface">
                        <X size={14} weight="bold" />
                      </IconButton>
                    </div>
                  )}
                  {error && (
                    <p id="food-error" role="alert" className="mt-3 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                      {error}
                    </p>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
                  <div className="mt-4 flex gap-3">
                    <Button variant="secondary" size="lg" onClick={() => fileRef.current?.click()}>
                      <Camera size={20} aria-hidden />
                      {photo ? "Replace" : "Photo"}
                    </Button>
                    <Button size="lg" className="flex-1" onClick={analyze} disabled={!text.trim() && !photo}>
                      <Sparkle size={18} weight="fill" aria-hidden />
                      Estimate
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "saved" && (
            <div className="mt-4">
              {!saved.length && !recents.length ? (
                <Empty
                  icon={<BookmarkSimple size={24} />}
                  title="Nothing saved yet"
                  body="Meals you save and foods you've logged recently show up here for one-tap logging."
                />
              ) : (
                <>
                  {saved.length > 0 && (
                    <>
                      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted">
                        <BookmarkSimple size={16} aria-hidden /> Saved meals
                      </h3>
                      <ul className="space-y-2">
                        {saved.map((m) => {
                          const kcal = m.items.reduce((a, i) => a + i.calories, 0);
                          const pro = m.items.reduce((a, i) => a + i.proteinG, 0);
                          return (
                            <li key={m.id} className="flex items-stretch gap-1">
                              <QuickRow
                                title={m.name}
                                sub={`${int(kcal)} kcal · ${int(pro)} g protein · ${m.items.length} item${m.items.length === 1 ? "" : "s"}`}
                                disabled={saving}
                                onClick={() => log(m.items, "saved", { savedMealId: m.id })}
                              />
                              <IconButton
                                label={`Delete saved meal ${m.name}`}
                                className="h-auto text-muted"
                                onClick={async () => {
                                  if (!window.confirm(`Delete the saved meal "${m.name}"?`)) return;
                                  await deleteSavedMeal(m.id);
                                  toast.success("Saved meal deleted");
                                }}
                              >
                                <Trash size={18} />
                              </IconButton>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {recents.length > 0 && (
                    <>
                      <h3 className={cn("mb-2 flex items-center gap-1.5 text-sm font-medium text-muted", saved.length > 0 && "mt-5")}>
                        <ClockCounterClockwise size={16} aria-hidden /> Recent foods
                      </h3>
                      <ul className="space-y-2">
                        {recents.map((r) => (
                          <li key={r.id}>
                            <QuickRow
                              title={r.name}
                              sub={`${r.quantity ? `${r.quantity} · ` : ""}${int(r.calories)} kcal · ${int(r.proteinG)} g protein`}
                              disabled={saving}
                              onClick={() =>
                                log([{ name: r.name, quantity: r.quantity, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG }], "saved")
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "manual" && (
            <form
              className="mt-4 space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!manual.name.trim()) return toast.error("Enter a name for the food.");
                if (manual.calories === "" || !(Number(manual.calories) >= 0)) return toast.error("Enter the calories.");
                log(
                  [{
                    name: manual.name,
                    quantity: "",
                    calories: Number(manual.calories),
                    proteinG: Number(manual.proteinG) || 0,
                    carbsG: Number(manual.carbsG) || 0,
                    fatG: Number(manual.fatG) || 0,
                  }],
                  "manual",
                );
              }}
            >
              <Field label="Food" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Protein shake" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Calories" type="number" inputMode="numeric" suffix="kcal" value={manual.calories} onChange={(e) => setManual({ ...manual, calories: e.target.value })} />
                <Field label="Protein" type="number" inputMode="decimal" suffix="g" value={manual.proteinG} onChange={(e) => setManual({ ...manual, proteinG: e.target.value })} />
                <Field label="Carbs" type="number" inputMode="decimal" suffix="g" value={manual.carbsG} onChange={(e) => setManual({ ...manual, carbsG: e.target.value })} />
                <Field label="Fat" type="number" inputMode="decimal" suffix="g" value={manual.fatG} onChange={(e) => setManual({ ...manual, fatG: e.target.value })} />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={saving}>
                Log food
              </Button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}

function QuickRow({ title, sub, onClick, disabled }: { title: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border px-3.5 py-2 text-left transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-[0.99] disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted tnum">{sub}</span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-lime text-on-lime" aria-hidden>
        <Plus size={16} weight="bold" />
      </span>
    </button>
  );
}
