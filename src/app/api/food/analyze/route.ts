import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AI_NOT_CONFIGURED, MODEL, aiConfigured, aiErrorMessage, anthropic } from "@/lib/ai";
import { assertAuthed } from "@/lib/session";

export const maxDuration = 60;

const Analysis = z.object({
  meal_name: z.string().describe("Short name for the whole meal, e.g. 'Chicken burrito bowl'. Empty if no food was found."),
  items: z.array(
    z.object({
      name: z.string().describe("The food, e.g. 'Grilled chicken breast'"),
      quantity: z.string().describe("The portion this estimate assumes, e.g. '6 oz' or '1 cup cooked'"),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
  note: z.string().describe("One short sentence on the main assumption or uncertainty, or why no food was found. Empty if nothing needs saying."),
});

const SYSTEM = `You estimate the nutrition of meals for a personal food log. The user describes what they ate in text, sends a photo of it, or both.

Break the meal into its distinct foods and estimate calories, protein, carbohydrate, and fat for each, for the portion actually eaten.

- Use the quantities the user states. Where they give none, assume a typical single serving and state the portion you assumed in "quantity".
- For photos, judge portion size from the plate, utensils, and packaging. Count cooking oil, butter, dressings, and sauces that the dish would normally include: they are the most common source of underestimates.
- If the photo shows a nutrition label, read the values from the label and scale by the number of servings the user says they ate (one serving if they don't say).
- For branded or restaurant items, use the published nutrition if you know it.
- Round calories to the nearest 5 and grams to the nearest whole number. Calories should be consistent with the macros (4 kcal per gram of protein and carbohydrate, 9 per gram of fat).
- Text added alongside a photo is context or a correction: it takes priority over what you infer from the image.
- If there is no food to log, return an empty items list and say why in "note".`;

type Body = { text?: string; image?: { data: string; mediaType: string } };
const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];

export async function POST(req: Request) {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!aiConfigured()) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const text = body?.text?.trim() ?? "";
  const image = body?.image;
  if (!text && !image) {
    return NextResponse.json({ error: "Describe the meal or add a photo." }, { status: 400 });
  }
  if (image && !MEDIA.includes(image.mediaType as Media)) {
    return NextResponse.json({ error: "That image type isn't supported." }, { status: 400 });
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType as Media, data: image.data },
    });
  }
  content.push({ type: "text", text: text || "Estimate the nutrition of this meal." });

  try {
    const res = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "low", format: zodOutputFormat(Analysis) },
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json(
        { error: "The AI couldn't analyze that. Try describing the meal in words." },
        { status: 422 },
      );
    }
    const out = res.parsed_output;
    return NextResponse.json({
      mealName: out.meal_name,
      note: out.note,
      items: out.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        calories: Math.max(0, Math.round(i.calories)),
        proteinG: Math.max(0, Math.round(i.protein_g)),
        carbsG: Math.max(0, Math.round(i.carbs_g)),
        fatG: Math.max(0, Math.round(i.fat_g)),
      })),
    });
  } catch (err) {
    console.error("[food/analyze]", err);
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}
