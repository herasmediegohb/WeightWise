import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Profile } from "@/db/schema";
import { MODEL, aiConfigured, aiErrorMessage, anthropic } from "./ai";
import {
  COACH_SYSTEM,
  buildCheckinStats,
  buildCoachContext,
  fallbackCheckinSummary,
  lastCompletedWeekStart,
} from "./coach";

const Review = z.object({
  headline: z.string().describe("The week in at most 8 words, e.g. 'Down 1.2 lb, protein running low'"),
  summary: z.string().describe("The review itself, in markdown"),
});

/**
 * Builds and saves the check-in for the last completed week (Monday to
 * Sunday). Falls back to a plain summary when AI is off or fails.
 */
export async function generateCheckin(p: Profile, today: string) {
  const start = lastCompletedWeekStart(today);
  const { stats, suggested } = await buildCheckinStats(p, today, start);

  let review = fallbackCheckinSummary(stats, suggested, p);
  let warning: string | undefined;
  if (aiConfigured()) {
    try {
      const context = await buildCoachContext(p, today);
      const goalInstruction =
        p.phase === "maintain"
          ? `I'm in maintenance: the aim is to hold my trend weight within about 1.5 lb of ${p.goalWeightLb} lb. The app's suggested maintenance target works out to ${suggested} kcal (my current target is ${stats.currentCalorieTarget}). The app shows me a button to apply it, so explain whether the change makes sense given how reliable this week's data is, and don't propose a different number.

Cover, in this order and in about 120 to 180 words total: whether my trend stayed in the maintenance band; what the food and water logs show (and whether there were enough logged days to trust them); the one thing most worth doing next week.`
          : `The app's calorie target for my chosen pace, from the estimated expenditure, works out to ${suggested} kcal (my current target is ${stats.currentCalorieTarget}). The app shows me a button to apply that number, so explain whether the change makes sense given how reliable this week's data is, and don't propose a different number.

Cover, in this order and in about 120 to 180 words total: how the trend moved against my target pace; what the food and water logs show (and whether there were enough logged days to trust them); the one thing most worth doing differently next week.`;
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

${goalInstruction} Speak to me directly.`,
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
  return { headline: review.headline, warning };
}
