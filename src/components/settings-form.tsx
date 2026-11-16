"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple, SignOut } from "@phosphor-icons/react";
import { toast } from "sonner";
import { deleteAllData, logout, saveProfile, setPhase, type ProfileInput } from "@/app/actions";
import { ACTIVITY } from "@/lib/calc";
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
  const [f, setF] = useState({
    name: initial.name,
    birthdate: initial.birthdate,
    feet: String(Math.floor(initial.heightIn / 12)),
    inches: String(Math.round((initial.heightIn % 12) * 10) / 10),
    startWeightLb: String(initial.startWeightLb),
    startDate: initial.startDate,
    goalWeightLb: String(initial.goalWeightLb),
    calorieTarget: String(initial.calorieTarget),
    proteinTargetG: String(initial.proteinTargetG),
    waterTargetOz: String(initial.waterTargetOz),
  });
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
      heightIn: Number(f.feet) * 12 + Number(f.inches || 0),
      startWeightLb: Number(f.startWeightLb),
      startDate: f.startDate,
      goalWeightLb: Number(f.goalWeightLb),
      paceLbPerWeek: Number(pace),
      activityLevel: activity,
      calorieTarget: Number(f.calorieTarget),
      proteinTargetG: Number(f.proteinTargetG),
      waterTargetOz: Number(f.waterTargetOz),
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    setDirty(false);
    toast.success("Settings saved");
  }

  const paceOptions = ["0.5", "1", "1.5", "2"].includes(pace) ? ["0.5", "1", "1.5", "2"] : [pace, "0.5", "1", "1.5", "2"];

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
                {phase === "maintain" ? "For maintenance, the next step is" : `For ${pace} lb a week, that suggests`}{" "}
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
            <Field label="Water" type="number" inputMode="numeric" suffix="oz" value={f.waterTargetOz} onChange={set("waterTargetOz")} />
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
                ? "Holding your goal weight, give or take 1.5 lb. The weekly check-in keeps calories on track."
                : "Each weekly check-in suggests calories for your chosen pace."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting weight" type="number" inputMode="decimal" step="0.1" suffix="lb" value={f.startWeightLb} onChange={set("startWeightLb")} />
            <Field label="Start date" type="date" max={today} value={f.startDate} onChange={set("startDate")} />
          </div>
          <Field label="Goal weight" type="number" inputMode="decimal" step="0.1" suffix="lb" value={f.goalWeightLb} onChange={set("goalWeightLb")} />
          <div className={phase === "maintain" ? "hidden" : undefined}>
            <p className="mb-1.5 text-sm font-medium">Pace, lb per week</p>
            <Segmented label="Weekly loss pace" value={pace} onChange={touch(setPace)} options={paceOptions.map((v) => ({ value: v, label: v }))} />
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
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Height</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Feet" type="number" inputMode="numeric" suffix="ft" value={f.feet} onChange={set("feet")} />
              <Field label="Inches" type="number" inputMode="decimal" suffix="in" value={f.inches} onChange={set("inches")} />
            </div>
          </fieldset>
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
