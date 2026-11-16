import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { MODEL, aiConfigured, aiErrorMessage, anthropic } from "@/lib/ai";
import {
  COACH_SYSTEM,
  buildCheckinStats,
  buildCoachContext,
  fallbackCheckinSummary,
  lastCompletedWeekStart,
} from "@/lib/coach";
import { getProfile } from "@/lib/data";
import { assertAuthed, getClock } from "@/lib/session";

export const maxDuration = 60;

const Review = z.object({
  headline: z.string().describe("The week in at most 8 words, e.g. 'Down 1.2 lb, protein running low'"),
  summary: z.string().describe("The review itself, in markdown"),
});

export async function POST() {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: "Finish setting up your profile first." }, { status: 400 });
  const { today } = await getClock();
  const start = lastCompletedWeekStart(today);
  const { stats, suggested } = await buildCheckinStats(p, today, start);

  let review = fallbackCheckinSummary(stats, suggested);
  let warning: string | undefined;
  if (aiConfigured()) {
    try {
      const context = await buildCoachContext(p, today);
      const res = await anthropic().messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: [
          { type: "text", text: COACH_SYSTEM },
          { type: "text", text: context },
        ],
        messages: [
          {
            role: "user",
            content: `Write my weekly check-in for ${stats.weekStart} to ${stats.weekEnd}.

These are the week's numbers as the app computed them:
${JSON.stringify(stats, null, 2)}

The app's calorie target for my chosen pace, from the estimated expenditure, works out to ${suggested} kcal (my current target is ${stats.currentCalorieTarget}). The app shows me a button to apply that number, so explain whether the change makes sense given how reliable this week's data is, and don't propose a different number.

Cover, in this order and in about 120 to 180 words total: how the trend moved against my target pace; what the food and water logs show (and whether there were enough logged days to trust them); the one thing most worth doing differently next week. Speak to me directly.`,
          },
        ],
        output_config: { effort: "medium", format: zodOutputFormat(Review) },
      });
      if (res.parsed_output && res.stop_reason !== "refusal") review = res.parsed_output;
    } catch (err) {
      console.error("[checkin]", err);
      warning = aiErrorMessage(err);
    }
  }

  const db = await getDb();
  const values = {
    weekStart: start,
    stats,
    headline: review.headline,
    summary: review.summary,
    suggestedCalories: suggested,
    appliedAt: null,
    createdAt: new Date(),
  };
  await db
    .insert(schema.checkins)
    .values(values)
    .onConflictDoUpdate({ target: schema.checkins.weekStart, set: values });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, warning });
}
