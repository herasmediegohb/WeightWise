import { NextResponse } from "next/server";
import { snapshot } from "@/lib/backup";
import { assertAuthed, getClock } from "@/lib/session";

/** Full data export as one JSON file. It can be restored from Settings. */
export async function GET() {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const [data, { today }] = await Promise.all([snapshot(), getClock()]);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="weightwise-export-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
