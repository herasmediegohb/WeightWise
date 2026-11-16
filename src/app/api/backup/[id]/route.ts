import { NextResponse } from "next/server";
import { getBackup } from "@/lib/backup";
import { assertAuthed } from "@/lib/session";

/** Downloads one stored backup as a JSON file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const id = Number((await ctx.params).id);
  const data = Number.isInteger(id) ? await getBackup(id) : null;
  if (!data) return NextResponse.json({ error: "That backup doesn't exist." }, { status: 404 });
  const day = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="weightwise-backup-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
