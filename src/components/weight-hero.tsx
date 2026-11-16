"use client";

import { useState } from "react";
import { Check, Plus, TrendDown, TrendUp } from "@phosphor-icons/react";
import type { TrendPoint } from "@/lib/calc";
import { formatShort } from "@/lib/dates";
import { cn, num, signed } from "@/lib/utils";
import { Bar, Button, Card, Eyebrow } from "./ui";
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
  const losing = rate !== null && rate < -0.05;
  const gaining = rate !== null && rate > 0.05;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Trend weight</Eyebrow>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="display text-6xl font-semibold">{num(latest?.trend ?? startWeight)}</span>
            <span className="text-lg font-medium text-muted">lb</span>
          </p>
          {latest && latest.date !== today && (
            <p className="mt-2 text-sm text-muted tnum">
              Last weigh-in {num(latest.weight)} lb on {formatShort(latest.date)}
            </p>
          )}
        </div>
        {rate !== null && (
          <span
            className={cn(
              "mt-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tnum",
              losing ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted",
            )}
          >
            {gaining ? <TrendUp size={16} weight="bold" aria-hidden /> : <TrendDown size={16} weight="bold" aria-hidden />}
            {signed(rate)} lb/wk
          </span>
        )}
      </div>

      <div className="-mx-5 mt-3">
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

      <div className="mt-5">
        {todayLog ? (
          <button
            type="button"
            onClick={() => setSheet({ id: todayLog.id, date: today, weightLb: todayLog.weightLb, note: todayLog.note })}
            className="flex h-13 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-[15px] transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 font-medium">
              <Check size={18} weight="bold" className="text-accent" aria-hidden />
              Weighed in today
            </span>
            <span className="tnum">
              <span className="font-semibold">{num(todayLog.weightLb)} lb</span>
              <span className="ml-3 text-muted">Edit</span>
            </span>
          </button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setSheet({ date: today, weightLb: latest?.weight ?? null })}>
            <Plus size={18} weight="bold" aria-hidden />
            Log today&apos;s weight
          </Button>
        )}
      </div>
      <WeightSheet state={sheet} onClose={() => setSheet(null)} today={today} />
    </Card>
  );
}
