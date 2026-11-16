"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { setPhase } from "@/app/actions";
import type { MaintenanceStatus } from "@/lib/calc";
import { cn, int } from "@/lib/utils";
import { Button, Card } from "./ui";

/** Shown on Today once the trend reaches the goal while still in the losing phase. */
export function GoalReachedCard({ goalLabel }: { goalLabel: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-accent/40 bg-accent-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-on-lime" aria-hidden>
          <Trophy size={22} weight="fill" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">You reached {goalLabel}</h2>
          <p className="mt-1 text-[15px] text-muted">
            Your trend weight is at your goal. Switch to maintenance to hold it there: calories go up gradually, about 150 kcal a
            week, until you&apos;re eating what you burn. Or set a new goal.
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Button
          className="flex-1"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const res = await setPhase("maintain");
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            toast.success(`Maintenance on. New target: ${int(res.calorieTarget)} kcal`);
          }}
        >
          Switch to maintenance
        </Button>
        <Link
          href="/settings"
          className="inline-flex h-11 items-center rounded-2xl border border-border bg-surface px-4 text-[15px] font-semibold"
        >
          New goal
        </Link>
      </div>
    </Card>
  );
}

/**
 * The maintenance range as a bar: the shaded band is the goal ± 1.5 lb, the
 * dot is the trend weight. Labels are pre-formatted in the user's units.
 */
export function BandBar({
  status,
  trend,
  goal,
  labels,
}: {
  status: MaintenanceStatus;
  trend: number;
  goal: number;
  labels: { low: string; high: string; offBy: string };
}) {
  const span = 3;
  const lo = goal - span;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (2 * span)) * 100))}%`;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-track" role="img" aria-label={`Trend weight against the maintenance range ${labels.low} to ${labels.high}`}>
        <div
          className="absolute inset-y-0 rounded-full bg-accent/35"
          style={{ left: pos(status.low), right: `calc(100% - ${pos(status.high)})` }}
        />
        <div
          className={cn(
            "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface",
            status.state === "in" ? "bg-accent" : "bg-warn",
          )}
          style={{ left: pos(trend) }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm tnum">
        <span className="text-muted">{labels.low}</span>
        <span className={cn("font-semibold", status.state === "in" ? "text-accent" : "text-warn")}>
          {status.state === "in" ? "In your range" : `${labels.offBy} ${status.state} range`}
        </span>
        <span className="text-muted">{labels.high}</span>
      </div>
    </div>
  );
}
