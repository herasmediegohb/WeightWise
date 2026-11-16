"use client";

import { useState, useTransition } from "react";
import { Check, PencilSimple, TrendDown, TrendUp } from "@phosphor-icons/react";
import { toast } from "sonner";
import { logWeight } from "@/app/actions";
import type { TrendPoint } from "@/lib/calc";
import { formatShort } from "@/lib/dates";
import { cn, num, signed } from "@/lib/utils";
import { Bar, Button, Card, Eyebrow, IconButton } from "./ui";
import { WeightSheet, type WeightSheetState } from "./weight-sheet";

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 64;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const ys = points.map((p) => p.trend);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const x = (d: string) => ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => 6 + (1 - (v - min) / Math.max(0.1, max - min)) * (H - 12);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last.date)} cy={y(last.trend)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WeightHero({
  today,
  latest,
  todayLog,
  previous,
  recent,
  rate,
  lost,
  remaining,
  progress,
  startWeight,
  goalWeight,
  className,
}: {
  today: string;
  latest: TrendPoint | null;
  todayLog: { id: number; weightLb: number; note: string | null } | null;
  /** The most recent weigh-in before today, for the day-to-day change. */
  previous: { date: string; weightLb: number } | null;
  recent: TrendPoint[];
  rate: number | null;
  lost: number;
  remaining: number;
  progress: number;
  startWeight: number;
  goalWeight: number;
  className?: string;
}) {
  const [sheet, setSheet] = useState<WeightSheetState>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const losing = rate !== null && rate < -0.05;
  const gaining = rate !== null && rate > 0.05;
  const change = todayLog && previous ? todayLog.weightLb - previous.weightLb : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!value || !Number.isFinite(n) || n < 50 || n > 800) {
      setError("Enter a weight between 50 and 800 lb.");
      return;
    }
    setError("");
    startSaving(async () => {
      const res = await logWeight({ date: today, weightLb: Math.round(n * 10) / 10 });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setValue("");
      toast.success("Weight logged");
    });
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Today&apos;s weight</Eyebrow>
        {rate !== null && (
          <span
            className={cn(
              "-mt-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tnum",
              losing ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
            )}
          >
            {gaining ? <TrendUp size={16} weight="bold" aria-hidden /> : <TrendDown size={16} weight="bold" aria-hidden />}
            {signed(rate)} lb/wk
          </span>
        )}
      </div>

      {todayLog ? (
        <div className="mt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="display text-6xl font-semibold">{num(todayLog.weightLb)}</span>
            <span className="text-lg font-medium text-muted">lb</span>
            <IconButton
              label="Edit today's weight"
              className="ml-1 self-center text-muted"
              onClick={() => setSheet({ id: todayLog.id, date: today, weightLb: todayLog.weightLb, note: todayLog.note })}
            >
              <PencilSimple size={20} />
            </IconButton>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted tnum">
            <Check size={16} weight="bold" className="text-accent" aria-hidden />
            {change === null ? (
              "Logged"
            ) : Math.abs(change) < 0.05 ? (
              <>Same as {formatShort(previous!.date)}</>
            ) : (
              <>
                <span className={cn("font-semibold", change < 0 ? "text-accent" : "text-fg")}>{signed(change)} lb</span>
                since {formatShort(previous!.date)}
              </>
            )}
          </p>
        </div>
      ) : (
        <form onSubmit={save} noValidate className="mt-2">
          <div className="flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="today-weight" className="sr-only">
                Today&apos;s weight in pounds
              </label>
              <input
                id="today-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                enterKeyHint="done"
                placeholder={previous ? num(previous.weightLb) : "0.0"}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError("");
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "today-weight-error" : "today-weight-hint"}
                className="display h-16 w-full rounded-2xl border border-border bg-surface-2 pl-4 pr-12 text-4xl font-semibold text-fg placeholder:text-muted/40 transition-colors focus:border-accent focus:outline-none focus-visible:outline-none"
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-base font-medium text-muted">
                lb
              </span>
            </div>
            <Button type="submit" size="lg" className="h-16 px-6" loading={saving} disabled={!value}>
              Save
            </Button>
          </div>
          {error ? (
            <p id="today-weight-error" role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : (
            <p id="today-weight-hint" className="mt-2 text-sm text-muted tnum">
              {previous ? `Last weigh-in ${num(previous.weightLb)} lb on ${formatShort(previous.date)}. ` : ""}
              <button
                type="button"
                onClick={() => setSheet({ date: today, weightLb: null })}
                className="font-medium text-fg underline decoration-border underline-offset-4 hover:decoration-fg"
              >
                Add a note or another day
              </button>
            </p>
          )}
        </form>
      )}

      <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted">
          Trend weight <span className="text-xs">(smooths out daily swings)</span>
        </p>
        <p className="tnum">
          <span className="text-xl font-semibold">{num(latest?.trend ?? startWeight)}</span>
          <span className="ml-1 text-sm text-muted">lb</span>
        </p>
      </div>

      <div className="-mx-5 mt-2">
        <Sparkline points={recent} />
      </div>

      <div className="mt-4">
        <Bar value={progress} label={`${Math.round(progress * 100)}% of the way to your goal weight`} />
        <div className="mt-2 flex justify-between text-sm tnum">
          <span>
            <span className="font-semibold">{num(Math.max(0, lost))} lb</span> <span className="text-muted">lost</span>
          </span>
          <span>
            <span className="font-semibold">{num(remaining)} lb</span> <span className="text-muted">to {num(goalWeight)}</span>
          </span>
        </div>
      </div>
      <WeightSheet state={sheet} onClose={() => setSheet(null)} today={today} />
    </Card>
  );
}
