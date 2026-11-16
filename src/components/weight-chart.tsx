"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/calc";
import { DAY, formatFull, formatShort, fromMs, toMs } from "@/lib/dates";
import { num } from "@/lib/utils";
import { Segmented } from "./ui";

const RANGES = [
  { value: "30", label: "1M" },
  { value: "90", label: "3M" },
  { value: "180", label: "6M" },
  { value: "all", label: "All" },
];

export function WeightChart({ points, goal, today }: { points: TrendPoint[]; goal: number; today: string }) {
  const [range, setRange] = useState("90");

  const data = useMemo(() => {
    const from = range === "all" ? 0 : toMs(today) - Number(range) * DAY;
    return points.filter((p) => toMs(p.date) >= from).map((p) => ({ t: toMs(p.date), weight: p.weight, trend: p.trend }));
  }, [points, range, today]);

  const domain = useMemo(() => {
    if (!data.length) return [0, 1];
    const vals = data.flatMap((d) => [d.weight, d.trend]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.12);
    // Bring the goal line into view once it is reasonably close.
    const min = lo - goal < (hi - lo) * 1.5 + 6 ? Math.min(lo, goal) : lo;
    return [Math.floor(min - pad), Math.ceil(hi + pad)];
  }, [data, goal]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden /> Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted/60" aria-hidden /> Scale
          </span>
        </div>
        <Segmented label="Chart range" value={range} onChange={setRange} options={RANGES} className="w-48" />
      </div>
      {data.length < 2 ? (
        <p className="grid h-56 place-items-center text-center text-sm text-muted">
          Not enough weigh-ins in this range. Try a longer one.
        </p>
      ) : (
        <div
          className="mt-3 h-60 w-full"
          role="img"
          aria-label={`Weight chart. Trend moved from ${num(data[0].trend)} to ${num(data[data.length - 1].trend)} pounds between ${formatFull(fromMs(data[0].t))} and ${formatFull(fromMs(data[data.length - 1].t))}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => formatShort(fromMs(t))}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tickMargin={8}
              />
              <YAxis
                domain={domain}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickCount={5}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !d) return null;
                  return (
                    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
                      <p className="text-muted">{formatFull(fromMs(d.t))}</p>
                      <p className="mt-0.5 font-semibold tnum">Trend {num(d.trend)} lb</p>
                      <p className="text-muted tnum">Scale {num(d.weight)} lb</p>
                    </div>
                  );
                }}
              />
              {goal >= domain[0] && (
                <ReferenceLine
                  y={goal}
                  stroke="var(--accent)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={{ value: `Goal ${goal}`, position: "insideBottomRight", fill: "var(--accent)", fontSize: 12 }}
                />
              )}
              <Scatter dataKey="weight" fill="var(--muted)" fillOpacity={0.55} shape={<Dot />} isAnimationActive={false} />
              <Line dataKey="trend" type="monotone" stroke="var(--accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Dot(props: { cx?: number; cy?: number }) {
  if (props.cx === undefined || props.cy === undefined) return null;
  return <circle cx={props.cx} cy={props.cy} r={2.5} fill="var(--muted)" fillOpacity={0.55} />;
}
