import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runTick } from "@/lib/reminders";
import { recordTick, tickAuthorized } from "@/lib/scheduler";
import { runWeeklyBackup } from "@/lib/backup";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Called every 5 minutes by the database scheduler (Supabase pg_cron).
 * Sends due reminders, creates Monday's check-in and the weekly backup.
 */
async function handle(req: Request) {
  if (!tickAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  await recordTick();
  const origin = new URL(req.url).origin;
  try {
    const result = await runTick(origin, async (p, local) => runWeeklyBackup(local));
    if (result.ran.length) revalidatePath("/", "layout");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[tick]", err);
    return NextResponse.json({ error: "The scheduled run failed." }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
