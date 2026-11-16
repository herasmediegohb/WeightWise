"use client";

import { useState } from "react";
import { Plus, Scales } from "@phosphor-icons/react";
import { toast } from "sonner";
import { deleteScan, saveScan } from "@/app/actions";
import type { BodyScan } from "@/db/schema";
import type { BodyFatPlan } from "@/lib/calc";
import { formatFull, formatRange } from "@/lib/dates";
import { num, signed } from "@/lib/utils";
import { Button, Card, Empty, Field, Sheet } from "./ui";
import { WeightSheet, type WeightSheetState } from "./weight-sheet";

type Row = { id: number; date: string; weightLb: number; note: string | null; trend: number };

export function WeighInHistory({ rows, today }: { rows: Row[]; today: string }) {
  const [sheet, setSheet] = useState<WeightSheetState>(null);
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 7);
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <h2 className="font-semibold">Weigh-ins</h2>
        <Button size="sm" variant="secondary" onClick={() => setSheet({ date: today, weightLb: rows[0]?.weightLb ?? null })}>
          <Plus size={16} weight="bold" aria-hidden />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={<Scales size={24} />} title="No weigh-ins yet" body="Log your weight to start your trend line." />
      ) : (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((r, i) => {
              const prev = rows[rows.indexOf(r) + 1];
              const delta = prev ? r.weightLb - prev.weightLb : null;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSheet({ id: r.id, date: r.date, weightLb: r.weightLb, note: r.note })}
                    aria-label={`Edit weigh-in for ${formatFull(r.date)}, ${r.weightLb} pounds`}
                    className={`flex min-h-14 w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2 ${!all && rows.length <= 7 && i === shown.length - 1 ? "rounded-b-3xl" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{formatFull(r.date)}</span>
                      {r.note && <span className="block truncate text-sm text-muted">{r.note}</span>}
                    </span>
                    {delta !== null && Math.abs(delta) >= 0.05 && (
                      <span className="text-sm text-muted tnum">{signed(delta)}</span>
                    )}
                    <span className="w-16 shrink-0 text-right font-semibold tnum">{num(r.weightLb)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > 7 && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="h-12 w-full rounded-b-3xl border-t border-border text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
            >
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
      <WeightSheet state={sheet} onClose={() => setSheet(null)} today={today} />
    </Card>
  );
}

const SCAN_FIELDS = [
  { key: "bodyFatPct", label: "Body fat", unit: "%", lowerIsBetter: true },
  { key: "muscleMassLb", label: "Muscle mass", unit: "lb", lowerIsBetter: false },
  { key: "leanMassLb", label: "Lean mass", unit: "lb", lowerIsBetter: false },
  { key: "fatMassLb", label: "Fat mass", unit: "lb", lowerIsBetter: true },
  { key: "visceralFatLevel", label: "Visceral fat", unit: "level", lowerIsBetter: true },
  { key: "waterPct", label: "Body water", unit: "%", lowerIsBetter: false },
  { key: "bmrKcal", label: "BMR", unit: "kcal", lowerIsBetter: false },
] as const;

type ScanKey = (typeof SCAN_FIELDS)[number]["key"];

export function BodyComposition({ scans, today, plan }: { scans: BodyScan[]; today: string; plan: BodyFatPlan | null }) {
  const [editing, setEditing] = useState<BodyScan | "new" | null>(null);
  const newestFirst = [...scans].reverse();

  /** Latest known value per measure, and the one before it, for the change. */
  const latest = (key: ScanKey) => {
    const withVal = newestFirst.filter((s) => s[key] !== null);
    return { cur: withVal[0] ?? null, prev: withVal[1] ?? null };
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Body composition</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus size={16} weight="bold" aria-hidden />
          Add scan
        </Button>
      </div>
      {scans.length === 0 ? (
        <Empty
          icon={<Scales size={24} />}
          title="No scans yet"
          body="Add the numbers from an InBody or similar scan to track fat and muscle separately from weight."
        />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            {SCAN_FIELDS.map((f) => {
              const { cur, prev } = latest(f.key);
              if (!cur) return null;
              const delta = prev ? (cur[f.key] as number) - (prev[f.key] as number) : null;
              const good = delta !== null && delta !== 0 && delta < 0 === f.lowerIsBetter;
              return (
                <div key={f.key}>
                  <dt className="text-sm text-muted">{f.label}</dt>
                  <dd className="mt-0.5 tnum">
                    <span className="text-2xl font-semibold tracking-tight">{num(cur[f.key])}</span>
                    <span className="ml-1 text-sm text-muted">{f.unit}</span>
                    {delta !== null && Math.abs(delta) >= 0.05 && (
                      <span className={`ml-2 text-sm font-medium ${good ? "text-accent" : "text-muted"}`}>{signed(delta)}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {plan && plan.milestones.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="font-semibold">Body-fat milestones</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                About <span className="font-semibold text-fg tnum">{num(plan.estimatedPct)}%</span> now, estimated from your trend weight
                and {num(plan.leanMassLb)} lb of lean mass ({plan.leanSource === "measured" ? "measured in" : "worked out from"} your{" "}
                {formatFull(plan.scanDate)} scan). Dates assume you keep that lean mass, which enough protein and strength training help with.
              </p>
              <ul className="mt-3 space-y-2">
                {plan.milestones.map((m) => (
                  <li key={m.pct} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                    <span className="w-12 shrink-0 text-lg font-semibold tnum">{m.pct}%</span>
                    <span className="min-w-0 flex-1 text-sm tnum">
                      <span className="block font-medium">at {num(m.weight)} lb</span>
                      <span className="block text-muted">
                        {m.reached
                          ? "Reached, by this estimate"
                          : m.date
                            ? `Projected ${formatFull(m.date)}${m.early ? `, likely ${formatRange(m.early, m.late)}` : ""}`
                            : "No date at the current rate"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">A new scan updates these.</p>
            </div>
          )}
          <h3 className="mb-1 mt-5 text-sm font-medium text-muted">Scans</h3>
          <ul className="-mx-2">
            {newestFirst.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-left text-[15px] hover:bg-surface-2"
                >
                  <span className="font-medium">{formatFull(s.date)}</span>
                  <span className="text-sm text-muted tnum">
                    {[s.bodyFatPct !== null && `${num(s.bodyFatPct)}% fat`, s.muscleMassLb !== null && `${num(s.muscleMassLb)} lb muscle`]
                      .filter(Boolean)
                      .join(" · ") || "Edit"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add body scan" : "Edit body scan"}
        description="Fill in what your scan reports. Leave the rest blank."
      >
        {editing && (
          <ScanForm
            key={editing === "new" ? "new" : editing.id}
            scan={editing === "new" ? null : editing}
            today={today}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Card>
  );
}

function ScanForm({ scan, today, onClose }: { scan: BodyScan | null; today: string; onClose: () => void }) {
  const [date, setDate] = useState(scan?.date ?? today);
  const [vals, setVals] = useState<Record<ScanKey, string>>(
    () => Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, scan?.[f.key] != null ? String(scan[f.key]) : ""])) as Record<ScanKey, string>,
  );
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy("save");
        const res = await saveScan({ date, ...vals });
        setBusy(null);
        if (!res.ok) return toast.error(res.error);
        toast.success("Scan saved");
        onClose();
      }}
    >
      <Field label="Scan date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} disabled={Boolean(scan)} />
      <div className="grid grid-cols-2 gap-3">
        {SCAN_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix={f.unit}
            value={vals[f.key]}
            onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}
          />
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        {scan && (
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={busy === "delete"}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("delete");
              await deleteScan(scan.id);
              setBusy(null);
              toast.success("Scan deleted");
              onClose();
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" loading={busy === "save"} disabled={busy !== null}>
          Save scan
        </Button>
      </div>
    </form>
  );
}
