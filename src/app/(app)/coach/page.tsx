import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { CheckinCard } from "@/components/checkin-card";
import { aiConfigured } from "@/lib/ai";
import { lastCompletedWeekStart, weekLabel } from "@/lib/coach";
import { getChat, getCheckins, getProfile, getWeights } from "@/lib/data";
import { getClock } from "@/lib/session";

export const metadata = { title: "Coach" };

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const p = await getProfile();
  if (!p) redirect("/onboarding");
  const { today } = await getClock();
  const [checkins, chat, weights, sp] = await Promise.all([getCheckins(1), getChat(), getWeights(), searchParams]);
  const start = lastCompletedWeekStart(today);
  const c = checkins[0]?.weekStart === start ? checkins[0] : null;

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <h1 className="mb-5 text-3xl font-semibold tracking-tight">Coach</h1>
      <div className="space-y-6">
        <CheckinCard
          weekLabel={weekLabel(start)}
          canGenerate={weights.length >= 2}
          currentTarget={p.calorieTarget}
          checkin={
            c && {
              id: c.id,
              headline: c.headline,
              summary: c.summary,
              stats: c.stats,
              suggestedCalories: c.suggestedCalories,
              applied: c.appliedAt !== null,
            }
          }
        />
        <Chat
          initial={chat.map((m) => ({ id: String(m.id), role: m.role, content: m.content }))}
          aiEnabled={aiConfigured()}
          ask={typeof sp.ask === "string" ? sp.ask.slice(0, 500) : undefined}
        />
      </div>
    </div>
  );
}
