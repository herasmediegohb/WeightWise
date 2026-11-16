import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { assertAuthed, getClock } from "@/lib/session";

/** Full data export as one JSON file. */
export async function GET() {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const db = await getDb();
  const [profile, weightLogs, foodEntries, savedMeals, waterLogs, bodyScans, checkins, chatMessages] =
    await Promise.all([
      db.select().from(schema.profile),
      db.select().from(schema.weightLogs),
      db.select().from(schema.foodEntries),
      db.select().from(schema.savedMeals),
      db.select().from(schema.waterLogs),
      db.select().from(schema.bodyScans),
      db.select().from(schema.checkins),
      db.select().from(schema.chatMessages),
    ]);
  const { today } = await getClock();
  return new NextResponse(
    JSON.stringify(
      { exportedAt: new Date().toISOString(), profile: profile[0] ?? null, weightLogs, foodEntries, savedMeals, waterLogs, bodyScans, checkins, chatMessages },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="weightwise-export-${today}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
