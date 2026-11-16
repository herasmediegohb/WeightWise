"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CalendarCheck, Check } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { applyCheckinTarget } from "@/app/actions";
import type { CheckinStats } from "@/db/schema";
import { int, signed } from "@/lib/utils";
import { Button, Card, Eyebrow } from "./ui";

export type CheckinView = {
  id: number;
  headline: string;
  summary: string;
  stats: CheckinStats;
  suggestedCalories: number | null;
  applied: boolean;
} | null;

export function CheckinCard({
  checkin,
  weekLabel,
  canGenerate,
  currentTarget,
}: {
  checkin: CheckinView;
  weekLabel: string;
  canGenerate: boolean;
  currentTarget: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"gen" | "apply" | null>(null);

  async function generate() {
    setBusy("gen");
    try {
      const res = await fetch("/api/checkin", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "The check-in couldn't be created. Try again.");
      if (json.warning) toast.message("Check-in created without the AI review", { description: json.warning });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof TypeError ? "You seem to be offline. Try again when you're connected." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!checkin) {
    return (
      <Card>
        <Eyebrow className="flex items-center gap-1.5">
          <CalendarCheck size={16} weight="fill" className="text-accent" aria-hidden />
          Weekly check-in · {weekLabel}
        </Eyebrow>
        <p className="mt-2 text-xl font-semibold tracking-tight">Review last week</p>
        <p className="mt-1 text-[15px] text-muted">
          {canGenerate
            ? "See how your trend moved, what your logs show, and whether your calorie target still fits your pace."
            : "Log a few weigh-ins first. The check-in needs a trend to review."}
        </p>
        <Button className="mt-4 w-full" size="lg" onClick={generate} loading={busy === "gen"} disabled={!canGenerate}>
          Create check-in
        </Button>
      </Card>
    );
  }

  const s = checkin.stats;
  const showTarget =
    checkin.suggestedCalories !== null && !checkin.applied && Math.abs(checkin.suggestedCalories - currentTarget) >= 50;
  const chips = [
    s.trendChange !== null && { k: "Trend", v: `${signed(s.trendChange)} lb` },
    { k: "Weigh-ins", v: String(s.weighIns) },
    { k: "Days logged", v: `${s.daysLogged}/7` },
    s.avgCalories !== null && { k: "Avg kcal", v: int(s.avgCalories) },
    s.avgProtein !== null && { k: "Avg protein", v: `${s.avgProtein} g` },
    s.avgWaterOz !== null && { k: "Avg water", v: `${s.avgWaterOz} oz` },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <Eyebrow className="flex items-center gap-1.5">
          <CalendarCheck size={16} weight="fill" className="text-accent" aria-hidden />
          Weekly check-in · {weekLabel}
        </Eyebrow>
        <button
          type="button"
          onClick={generate}
          disabled={busy !== null}
          aria-label="Create the check-in again"
          title="Create again"
          className="-mr-2 -mt-2 grid size-11 place-items-center rounded-2xl text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
        >
          <ArrowsClockwise size={18} className={busy === "gen" ? "animate-spin" : ""} />
        </button>
      </div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{checkin.headline}</h2>
      <dl className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <div key={c.k} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
            <dt className="inline text-muted">{c.k} </dt>
            <dd className="inline font-semibold tnum">{c.v}</dd>
          </div>
        ))}
      </dl>
      <div className="prose-coach mt-4 text-[15px] leading-relaxed text-fg/90">
        <ReactMarkdown>{checkin.summary}</ReactMarkdown>
      </div>
      {showTarget && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-soft p-3.5">
          <p className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold tnum">
              New target: {int(checkin.suggestedCalories)} kcal
            </span>
            <span className="text-muted tnum">Currently {int(currentTarget)} kcal</span>
          </p>
          <Button
            size="sm"
            loading={busy === "apply"}
            disabled={busy !== null}
            onClick={async () => {
              setBusy("apply");
              const res = await applyCheckinTarget(checkin.id);
              setBusy(null);
              if (!res.ok) return toast.error(res.error);
              toast.success("Calorie target updated");
            }}
          >
            Apply
          </Button>
        </div>
      )}
      {checkin.applied && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
          <Check size={16} weight="bold" className="text-accent" aria-hidden />
          Target updated to {int(checkin.suggestedCalories)} kcal
        </p>
      )}
    </Card>
  );
}
