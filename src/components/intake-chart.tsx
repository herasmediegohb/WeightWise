"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFull, formatShort } from "@/lib/dates";
import { int } from "@/lib/utils";

export function IntakeChart({
  days,
  target,
}: {
  days: { date: string; calories: number | null; proteinG: number | null }[];
  target: number;
}) {
  const logged = days.filter((d) => d.calories !== null).length;
  return (
    <div
      className="h-44 w-full"
      role="img"
      aria-label={`Daily calories for the last ${days.length} days against a target of ${target}. ${logged} days have food logged.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="22%">
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatShort(d)}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            interval={6}
            tickMargin={8}
          />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} tickCount={4} domain={[0, (max: number) => Math.ceil(Math.max(max, target * 1.15) / 500) * 500]} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof days)[number] | undefined;
              if (!active || !d) return null;
              return (
                <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
                  <p className="text-muted">{formatFull(d.date)}</p>
                  {d.calories === null ? (
                    <p className="mt-0.5">Nothing logged</p>
                  ) : (
                    <>
                      <p className="mt-0.5 font-semibold tnum">{int(d.calories)} kcal</p>
                      <p className="text-muted tnum">{int(d.proteinG)} g protein</p>
                    </>
                  )}
                </div>
              );
            }}
          />
          <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `Target ${int(target)}`, position: "insideTopRight", fill: "var(--muted)", fontSize: 12 }} />
          <Bar dataKey="calories" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {days.map((d) => (
              <Cell key={d.date} fill={(d.calories ?? 0) > target * 1.05 ? "var(--warn)" : "var(--accent)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
