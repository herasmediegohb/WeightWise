"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { saveProfile } from "@/app/actions";
import { ImportButton } from "@/components/import-button";
import { Logo } from "@/components/nav";
import { TzSync } from "@/components/tz-sync";
import { Button, Field, Segmented } from "@/components/ui";
import {
  ACTIVITY,
  ageOn,
  bmr,
  formulaTdee,
  suggestCalorieTarget,
  suggestProteinTarget,
} from "@/lib/calc";
import { formatFull, isValidDate } from "@/lib/dates";
import { cn, int } from "@/lib/utils";

type Existing = {
  earliest: { date: string; weightLb: number };
  latest: { date: string; weightLb: number };
  count: number;
} | null;

type Activity = "sedentary" | "light" | "moderate" | "active";

export function Onboarding({ today, tz, existing }: { today: string; tz: string; existing: Existing }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Existing>(existing);

  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [startWeight, setStartWeight] = useState(existing ? String(existing.earliest.weightLb) : "");
  const [startDate, setStartDate] = useState(existing?.earliest.date ?? today);
  const [goalWeight, setGoalWeight] = useState("");
  const [activity, setActivity] = useState<Activity>("light");
  const [pace, setPace] = useState("1");
  const [overrides, setOverrides] = useState<{ calories?: string; protein?: string; water?: string }>({});

  const heightIn = Number(feet) * 12 + Number(inches || 0);
  const currentWeight = history?.latest.weightLb ?? Number(startWeight);

  const plan = useMemo(() => {
    if (!isValidDate(birthdate) || !heightIn || !currentWeight) return null;
    const resting = bmr({ weightLb: currentWeight, heightIn, age: ageOn(birthdate, today), sex });
    const tdee = formulaTdee(resting, activity);
    return {
      tdee,
      calories: suggestCalorieTarget(tdee, Number(pace), sex),
      protein: suggestProteinTarget(Number(goalWeight) || currentWeight),
    };
  }, [birthdate, heightIn, currentWeight, today, sex, activity, pace, goalWeight]);

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!name.trim()) e.name = "Enter your name.";
      if (!isValidDate(birthdate) || birthdate >= today) e.birthdate = "Enter your date of birth.";
      else if (ageOn(birthdate, today) < 18) e.birthdate = "This app is for adults 18 and over.";
      if (!(Number(feet) >= 3 && Number(feet) <= 8)) e.feet = "Enter feet, 3 to 8.";
      if (inches !== "" && !(Number(inches) >= 0 && Number(inches) < 12)) e.inches = "0 to 11.";
    }
    if (s === 1) {
      const sw = Number(startWeight);
      const gw = Number(goalWeight);
      if (!(sw >= 50 && sw <= 800)) e.startWeight = "Enter your starting weight in pounds.";
      if (!isValidDate(startDate) || startDate > today) e.startDate = "Pick today or an earlier date.";
      if (!(gw >= 50 && gw <= 800)) e.goalWeight = "Enter your goal weight in pounds.";
      else if (sw && gw >= sw) e.goalWeight = "Your goal should be below your starting weight.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish() {
    if (!plan) return;
    setSaving(true);
    const res = await saveProfile({
      name,
      birthdate,
      sex,
      heightIn,
      startWeightLb: Number(startWeight),
      startDate,
      goalWeightLb: Number(goalWeight),
      paceLbPerWeek: Number(pace),
      activityLevel: activity,
      calorieTarget: Number(overrides.calories ?? plan.calories),
      proteinTargetG: Number(overrides.protein ?? plan.protein),
      waterTargetOz: Number(overrides.water ?? 80),
    });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.error);
      return;
    }
    router.replace("/");
  }

  const titles = ["About you", "Your weight", "Your plan"];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <TzSync current={tz} />
      <header className="flex items-center gap-3">
        <Logo />
        <div
          className="flex flex-1 gap-1.5"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step + 1}
        >
          {titles.map((t, i) => (
            <div key={t} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-accent" : "bg-track")} />
          ))}
        </div>
        <span className="text-sm text-muted tnum">{step + 1} of 3</span>
      </header>

      <form
        className="mt-8 flex flex-1 flex-col"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!validate(step)) return;
          if (step < 2) setStep(step + 1);
          else finish();
        }}
      >
        <h1 className="text-3xl font-semibold tracking-tight">{titles[step]}</h1>

        {step === 0 && (
          <div className="mt-6 space-y-5">
            <p className="-mt-3 text-muted">These set up your energy estimate. You can change them later.</p>
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" error={errors.name} />
            <Field label="Date of birth" type="date" max={today} value={birthdate} onChange={(e) => setBirthdate(e.target.value)} autoComplete="bday" error={errors.birthdate} />
            <div>
              <p className="mb-1.5 text-sm font-medium">Sex</p>
              <Segmented label="Sex" value={sex} onChange={setSex} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
              <p className="mt-1.5 text-sm text-muted">Used only by the resting-energy formula.</p>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Height</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Feet" inputMode="numeric" type="number" suffix="ft" value={feet} onChange={(e) => setFeet(e.target.value)} error={errors.feet} />
                <Field label="Inches" inputMode="decimal" type="number" suffix="in" value={inches} onChange={(e) => setInches(e.target.value)} error={errors.inches} />
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-border bg-surface p-4">
              {history ? (
                <div className="flex gap-3">
                  <CheckCircle size={24} weight="fill" className="shrink-0 text-accent" aria-hidden />
                  <div className="text-sm">
                    <p className="font-semibold">{history.count} weigh-ins imported</p>
                    <p className="mt-0.5 text-muted">
                      From {history.earliest.weightLb} lb on {formatFull(history.earliest.date)} to {history.latest.weightLb} lb on{" "}
                      {formatFull(history.latest.date)}. Your starting point is filled in below.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-semibold">Coming from Base44?</p>
                  <p className="mb-3 mt-0.5 text-sm text-muted">
                    Import your WeightLog, DailyLog and BodyMeasurement CSV exports to keep your history.
                  </p>
                  <ImportButton
                    onImported={(s) => {
                      if (!s.earliest || !s.latest) return;
                      setHistory({ earliest: s.earliest, latest: s.latest, count: s.weights });
                      setStartWeight(String(s.earliest.weightLb));
                      setStartDate(s.earliest.date);
                    }}
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starting weight" type="number" inputMode="decimal" step="0.1" suffix="lb" value={startWeight} onChange={(e) => setStartWeight(e.target.value)} error={errors.startWeight} />
              <Field label="Start date" type="date" max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
            </div>
            <Field label="Goal weight" type="number" inputMode="decimal" step="0.1" suffix="lb" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} error={errors.goalWeight} />
          </div>
        )}

        {step === 2 && plan && (
          <div className="mt-6 space-y-6">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Activity level</legend>
              <div className="space-y-2">
                {Object.entries(ACTIVITY).map(([key, a]) => (
                  <label
                    key={key}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors",
                      activity === key ? "border-accent bg-accent-soft" : "border-border bg-surface",
                    )}
                  >
                    <input type="radio" name="activity" className="sr-only" checked={activity === key} onChange={() => { setActivity(key as Activity); setOverrides({}); }} />
                    <span className="flex-1">
                      <span className="block font-medium">{a.label}</span>
                      <span className="block text-sm text-muted">{a.hint}</span>
                    </span>
                    <span className={cn("grid size-5 place-items-center rounded-full border-2", activity === key ? "border-accent" : "border-border")} aria-hidden>
                      {activity === key && <span className="size-2.5 rounded-full bg-accent" />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="mb-2 text-sm font-medium">Pace</p>
              <Segmented
                label="Weekly loss pace"
                value={pace}
                onChange={(v) => { setPace(v); setOverrides({}); }}
                options={[
                  { value: "0.5", label: "0.5 lb" },
                  { value: "1", label: "1 lb" },
                  { value: "1.5", label: "1.5 lb" },
                  { value: "2", label: "2 lb" },
                ]}
              />
              <p className="mt-1.5 text-sm text-muted">Pounds per week. Slower is easier to sustain.</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm text-muted">
                At {int(currentWeight)} lb you burn about <strong className="font-semibold text-fg tnum">{int(plan.tdee)} kcal</strong> a day.
                These targets fit your pace. The app refines them once you log food for a week.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Field label="Calories" type="number" inputMode="numeric" value={overrides.calories ?? String(plan.calories)} onChange={(e) => setOverrides({ ...overrides, calories: e.target.value })} />
                <Field label="Protein (g)" type="number" inputMode="numeric" value={overrides.protein ?? String(plan.protein)} onChange={(e) => setOverrides({ ...overrides, protein: e.target.value })} />
                <Field label="Water (oz)" type="number" inputMode="numeric" value={overrides.water ?? "80"} onChange={(e) => setOverrides({ ...overrides, water: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        <div className="mt-auto flex gap-3 pt-8">
          {step > 0 && (
            <Button type="button" variant="secondary" size="lg" onClick={() => setStep(step - 1)} disabled={saving}>
              <ArrowLeft size={18} weight="bold" aria-hidden />
              Back
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" loading={saving}>
            {step < 2 ? "Continue" : "Start tracking"}
            {step < 2 && <ArrowRight size={18} weight="bold" aria-hidden />}
          </Button>
        </div>
      </form>
    </main>
  );
}
