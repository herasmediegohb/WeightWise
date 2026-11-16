"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple, SignOut } from "@phosphor-icons/react";
import { toast } from "sonner";
import { deleteAllData, logout, saveProfile, setPhase, type ProfileInput } from "@/app/actions";
import { ACTIVITY, MAINTAIN_BAND_LB } from "@/lib/calc";
import {
  KG_PER_LB,
  formatWeight,
  fromCm,
  fromWater,
  fromWeight,
  toCm,
  toWater,
  waterUnit,
  weightInputValue,
  weightUnit,
  type Units,
} from "@/lib/units";
import { int } from "@/lib/utils";
import { ImportButton } from "./import-button";
import { Button, Card, Field, Segmented, Sheet } from "./ui";

type Activity = ProfileInput["activityLevel"];

export function SettingsForm({
  initial,
  today,
  suggestedCalories,
  expenditure,
  aiEnabled,
  authEnabled,
  backups,
  phase,
}: {
  phase: "lose" | "maintain";
  initial: ProfileInput;
  today: string;
  suggestedCalories: number;
  expenditure: number;
  aiEnabled: boolean;
  authEnabled: boolean;
  /** The backups card, rendered between the form and "Your data". */
  backups?: React.ReactNode;
}) {
  const router = useRouter();
  const initialUnits: Units = initial.units ?? "imperial";
  /**
   * Exact stored values. A field still showing its stored value (in whatever
   * unit) maps back to that exact value, so switching units back and forth,
   * or saving in kg, never introduces rounding drift.
   */
  const exact = {
    startWeight: (u: Units) => weightInputValue(initial.startWeightLb, u),
    goalWeight: (u: Units) => weightInputValue(initial.goalWeightLb, u),
    water: (u: Units) => String(toWater(initial.waterTargetOz, u)),
  };
  const exactHeight = (u: Units) => heightFields(initial.heightIn, u);
  const isExactHeight = (cur: { feet: string; inches: string; cm: string }, u: Units) => {
    const h = exactHeight(u);
    return u === "metric" ? cur.cm === h.cm : cur.feet === h.feet && cur.inches === h.inches;
  };
  const [units, setUnits] = useState<Units>(initialUnits);
  // Weight, water and height fields hold display units; they're converted
  // back to pounds, ounces and inches on save.
  const [f, setF] = useState(() => ({
    name: initial.name,
    birthdate: initial.birthdate,
    ...heightFields(initial.heightIn, initialUnits),
    startWeight: weightInputValue(initial.startWeightLb, initialUnits),
    startDate: initial.startDate,
    goalWeight: weightInputValue(initial.goalWeightLb, initialUnits),
    calorieTarget: String(initial.calorieTarget),
    proteinTargetG: String(initial.proteinTargetG),
    water: String(toWater(initial.waterTargetOz, initialUnits)),
  }));
  const [sex, setSex] = useState(initial.sex);
  const [activity, setActivity] = useState<Activity>(initial.activityLevel);
  const [pace, setPace] = useState(String(initial.paceLbPerWeek));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setDirty(true);
  };
  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await saveProfile({
      name: f.name,
      birthdate: f.birthdate,
      sex,
      heightIn: isExactHeight(f, units) ? initial.heightIn : heightInches(f, units),
      startWeightLb:
        f.startWeight === exact.startWeight(units) ? initial.startWeightLb : f.startWeight === "" ? NaN : fromWeight(Number(f.startWeight), units),
      startDate: f.startDate,
      goalWeightLb:
        f.goalWeight === exact.goalWeight(units) ? initial.goalWeightLb : f.goalWeight === "" ? NaN : fromWeight(Number(f.goalWeight), units),
      paceLbPerWeek: Number(pace),
      activityLevel: activity,
      calorieTarget: Number(f.calorieTarget),
      proteinTargetG: Number(f.proteinTargetG),
      waterTargetOz:
        f.water === exact.water(units) ? initial.waterTargetOz : f.water === "" ? NaN : Math.round(fromWater(Number(f.water), units)),
      units,
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setDirty(false);
    toast.success("Settings saved");
  }

  const paceOptions = ["0.5", "1", "1.5", "2"].includes(pace) ? ["0.5", "1", "1.5", "2"] : [pace, "0.5", "1", "1.5", "2"];
  const paceLabel = (lb: string) => (units === "metric" ? `${(Number(lb) * KG_PER_LB).toFixed(1)} kg` : `${lb} lb`);

  /** Converts what's typed so far when switching units, so nothing is lost. */
  function switchUnits(next: Units) {
    if (next === units) return;
    const conv = (v: string, fn: (x: number) => string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? v : fn(Number(v)));
    setF((cur) => ({
      ...cur,
      ...(isExactHeight(cur, units) ? exactHeight(next) : heightFields(heightInches(cur, units), next)),
      startWeight:
        cur.startWeight === exact.startWeight(units)
          ? exact.startWeight(next)
          : conv(cur.startWeight, (x) => weightInputValue(fromWeight(x, units), next)),
      goalWeight:
        cur.goalWeight === exact.goalWeight(units)
          ? exact.goalWeight(next)
          : conv(cur.goalWeight, (x) => weightInputValue(fromWeight(x, units), next)),
      water: cur.water === exact.water(units) ? exact.water(next) : conv(cur.water, (x) => String(toWater(fromWater(x, units), next))),
    }));
    setUnits(next);
    setDirty(true);
  }

  return (
    <>
      <form onSubmit={save} noValidate className="space-y-4">
        <Card className="space-y-4">
          <h2 className="font-semibold">Daily targets</h2>
          <div>
            <Field label="Calories" type="number" inputMode="numeric" suffix="kcal" value={f.calorieTarget} onChange={set("calorieTarget")} />
            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm">
              <p className="text-muted tnum">
                You burn about {int(expenditure)} kcal a day.{" "}
                {phase === "maintain" ? "For maintenance, the next step is" : `For ${paceLabel(pace)} a week, that suggests`}{" "}
                <span className="font-semibold text-fg">{int(suggestedCalories)} kcal</span>.
              </p>
              {Number(f.calorieTarget) !== suggestedCalories && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 bg-surface"
                  onClick={() => {
                    setF({ ...f, calorieTarget: String(suggestedCalories) });
                    setDirty(true);
                  }}
                >
                  Use
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protein" type="number" inputMode="numeric" suffix="g" value={f.proteinTargetG} onChange={set("proteinTargetG")} />
            <Field label="Water" type="number" inputMode="numeric" suffix={waterUnit(units)} value={f.water} onChange={set("water")} />
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Goal</h2>
          <div>
            <p className="mb-1.5 text-sm font-medium">Phase</p>
            <Segmented
              label="Phase"
              value={phase}
              onChange={async (v) => {
                if (v === phase) return;
                const res = await setPhase(v);
                if (!res.ok) return toast.error(res.error);
                setF((cur) => ({ ...cur, calorieTarget: String(res.calorieTarget) }));
                toast.success(
                  v === "maintain"
                    ? `Maintenance on. Calories go up gradually, now ${int(res.calorieTarget)} kcal.`
                    : `Back to losing weight. Target ${int(res.calorieTarget)} kcal.`,
                );
              }}
              options={[
                { value: "lose", label: "Losing weight" },
                { value: "maintain", label: "Maintaining" },
              ]}
            />
            <p className="mt-1.5 text-sm text-muted">
              {phase === "maintain"
                ? `Holding your goal weight, give or take ${formatWeight(MAINTAIN_BAND_LB, units)}. The weekly check-in keeps calories on track.`
                : "Each weekly check-in suggests calories for your chosen pace."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting weight" type="number" inputMode="decimal" step="0.1" suffix={weightUnit(units)} value={f.startWeight} onChange={set("startWeight")} />
            <Field label="Start date" type="date" max={today} value={f.startDate} onChange={set("startDate")} />
          </div>
          <Field label="Goal weight" type="number" inputMode="decimal" step="0.1" suffix={weightUnit(units)} value={f.goalWeight} onChange={set("goalWeight")} />
          <div className={phase === "maintain" ? "hidden" : undefined}>
            <p className="mb-1.5 text-sm font-medium">Pace per week</p>
            <Segmented label="Weekly loss pace" value={pace} onChange={touch(setPace)} options={paceOptions.map((v) => ({ value: v, label: paceLabel(v) }))} />
          </div>
          <div>
            <label htmlFor="activity" className="mb-1.5 block text-sm font-medium">
              Activity level
            </label>
            <select
              id="activity"
              value={activity}
              onChange={(e) => touch(setActivity)(e.target.value as Activity)}
              className="h-12 w-full rounded-2xl border border-border bg-surface-2 px-4 text-base focus:border-accent focus:outline-none focus-visible:outline-none"
            >
              {Object.entries(ACTIVITY).map(([k, a]) => (
                <option key={k} value={k}>
                  {a.label}: {a.hint.toLowerCase()}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-sm text-muted">Only used until the app has enough of your food logs to measure it.</p>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-semibold">Profile</h2>
          <Field label="Name" value={f.name} onChange={set("name")} autoComplete="given-name" />
          <Field label="Date of birth" type="date" max={today} value={f.birthdate} onChange={set("birthdate")} />
          <div>
            <p className="mb-1.5 text-sm font-medium">Sex</p>
            <Segmented label="Sex" value={sex} onChange={touch(setSex)} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
          </div>
          {units === "metric" ? (
            <Field label="Height" type="number" inputMode="numeric" suffix="cm" value={f.cm} onChange={set("cm")} />
          ) : (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Height</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Feet" type="number" inputMode="numeric" suffix="ft" value={f.feet} onChange={set("feet")} />
                <Field label="Inches" type="number" inputMode="decimal" suffix="in" value={f.inches} onChange={set("inches")} />
              </div>
            </fieldset>
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium">Units</p>
            <Segmented
              label="Units"
              value={units}
              onChange={switchUnits}
              options={[
                { value: "imperial", label: "lb · oz · ft" },
                { value: "metric", label: "kg · ml · cm" },
              ]}
            />
            <p className="mt-1.5 text-sm text-muted">Changes how weights, water and height are shown and entered. Your data isn&apos;t changed.</p>
          </div>
        </Card>

        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 lg:bottom-4">
          <Button type="submit" size="lg" className="w-full shadow-lg shadow-black/20" loading={saving} disabled={!dirty}>
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </form>

      {backups && <div className="mt-4">{backups}</div>}

      <Card className="mt-4">
        <h2 className="font-semibold">Your data</h2>
        <div className="mt-3 divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <p className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">Import from Base44</span>
              <span className="text-muted">WeightLog, DailyLog and BodyMeasurement CSV exports. Safe to run again.</span>
            </p>
            <ImportButton onImported={() => router.refresh()} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">Export everything</span>
              <span className="text-muted">One JSON file with all your logs and settings. It can be restored under Backups.</span>
            </p>
            <a
              href="/api/export"
              download
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 text-[15px] font-semibold hover:bg-border/60"
            >
              <DownloadSimple size={18} weight="bold" aria-hidden />
              Download
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <p className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">Delete all data</span>
              <span className="text-muted">Removes every log, your profile, the coach history and the backups kept in the database. Off-site copies in Vercel Blob are kept.</span>
            </p>
            <Button type="button" variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">App</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">AI coach and food estimates</dt>
            <dd className="font-medium">{aiEnabled ? "On" : "Off, no API key set"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Password protection</dt>
            <dd className="font-medium">{authEnabled ? "On" : "Off (local development)"}</dd>
          </div>
        </dl>
        {authEnabled && (
          <form action={logout} className="mt-4">
            <Button type="submit" variant="secondary" className="w-full">
              <SignOut size={18} weight="bold" aria-hidden />
              Sign out
            </Button>
          </form>
        )}
      </Card>

      <Sheet open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete all data?" description="Every weigh-in, food and water log, body scan, check-in and your profile will be permanently removed.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setDeleting(true);
            const res = await deleteAllData(confirm);
            setDeleting(false);
            if (!res.ok) return toast.error(res.error);
            router.replace("/onboarding");
          }}
        >
          <Field label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setDeleteOpen(false)}>
              Keep my data
            </Button>
            <Button type="submit" variant="danger" size="lg" className="flex-1" loading={deleting} disabled={confirm !== "DELETE"}>
              Delete everything
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** Height fields for the form: feet and inches, or centimetres. */
function heightFields(heightIn: number, u: Units): { feet: string; inches: string; cm: string } {
  if (!Number.isFinite(heightIn) || heightIn <= 0) return { feet: "", inches: "", cm: "" };
  if (u === "metric") return { feet: "", inches: "", cm: String(Math.round(toCm(heightIn))) };
  const feet = Math.floor(heightIn / 12);
  return { feet: String(feet), inches: String(Math.round((heightIn - feet * 12) * 10) / 10), cm: "" };
}

function heightInches(f: { feet: string; inches: string; cm: string }, u: Units): number {
  if (u === "metric") return f.cm.trim() === "" ? NaN : fromCm(Number(f.cm));
  return f.feet.trim() === "" ? NaN : Number(f.feet) * 12 + Number(f.inches || 0);
}
