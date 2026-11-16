"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ArrowCounterClockwise, Check, Drop } from "@phosphor-icons/react";
import { toast } from "sonner";
import { addWater, undoWater } from "@/app/actions";
import { formatWater, fromWater, toWater, waterQuickAdds, waterUnit, type Units } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Card, Eyebrow, IconButton } from "./ui";


export function WaterCard({
  date,
  total,
  target,
  lastOz,
  units,
  className,
}: {
  date: string;
  total: number;
  target: number;
  /** Size of the most recent entry, so undo can update optimistically. */
  lastOz: number | null;
  units: Units;
  className?: string;
}) {
  const [optimistic, bump] = useOptimistic(total, (cur: number, delta: number) => Math.max(0, cur + delta));
  const [, start] = useTransition();
  const [custom, setCustom] = useState("");
  const pct = Math.min(1, optimistic / target);
  const done = optimistic >= target;

  function add(oz: number) {
    start(async () => {
      bump(oz);
      const res = await addWater({ date, oz });
      if (!res.ok) toast.error(res.error);
    });
  }

  function undo() {
    if (lastOz === null) return;
    start(async () => {
      bump(-lastOz);
      const res = await undoWater(date);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Fill level rises with progress. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full origin-bottom bg-water-soft transition-transform duration-700 ease-out-soft"
        style={{ transform: `scaleY(${pct})` }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <Eyebrow className="flex items-center gap-1.5">
            <Drop size={16} weight="fill" className="text-water" aria-hidden />
            Water
          </Eyebrow>
          <IconButton
            label="Undo last water entry"
            onClick={undo}
            disabled={lastOz === null || optimistic <= 0}
            className="-mr-2 -mt-2 text-muted"
          >
            <ArrowCounterClockwise size={20} />
          </IconButton>
        </div>
        <p className="mt-1 flex items-baseline gap-2" aria-live="polite">
          <span className="display text-5xl font-semibold">{toWater(optimistic, units).toLocaleString("en-US")}</span>
          <span className="text-base text-muted">of {formatWater(target, units)}</span>
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
          {done ? (
            <>
              <Check size={16} weight="bold" className="text-water" aria-hidden />
              Target reached
            </>
          ) : (
            `${formatWater(target - optimistic, units)} to go`
          )}
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {waterQuickAdds(units).map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => add(fromWater(amount, units))}
              aria-label={`Add ${amount} ${units === "metric" ? "millilitres" : "ounces"} of water`}
              className="h-12 rounded-2xl border border-border bg-surface text-[15px] font-semibold tnum transition-[transform,border-color] duration-150 hover:border-water active:scale-95"
            >
              +{amount}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom);
            const [min, max] = units === "metric" ? [30, 6000] : [1, 200];
            if (!(n >= min && n <= max)) return toast.error(`Enter an amount between ${min} and ${max} ${waterUnit(units)}.`);
            add(fromWater(n, units));
            setCustom("");
          }}
        >
          <label htmlFor="water-custom" className="sr-only">
            Custom amount in {units === "metric" ? "millilitres" : "ounces"}
          </label>
          <input
            id="water-custom"
            type="number"
            inputMode="decimal"
            placeholder={`Other amount (${waterUnit(units)})`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-base placeholder:text-muted/70 focus:border-water focus:outline-none focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!custom}
            className="h-11 rounded-2xl bg-water px-4 text-[15px] font-semibold text-white transition-[transform,opacity] active:scale-95 disabled:opacity-40 dark:text-[#06131f]"
          >
            Add
          </button>
        </form>
      </div>
    </Card>
  );
}
