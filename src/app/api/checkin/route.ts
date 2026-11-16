import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { generateCheckin } from "@/lib/checkin";
import { getProfile } from "@/lib/data";
import { assertAuthed, getClock } from "@/lib/session";

export const maxDuration = 60;

export async function POST() {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const p = await getProfile();
  if (!p) return NextResponse.json({ error: "Finish setting up your profile first." }, { status: 400 });
  const { today } = await getClock();
  const { warning } = await generateCheckin(p, today);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, warning });
}
