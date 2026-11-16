import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, TZ_COOKIE, authRequired, verifySessionToken } from "./auth";
import { hourInTz, todayInTz } from "./dates";

/** Server actions and route handlers are public endpoints: check every time. */
export async function assertAuthed(): Promise<void> {
  if (!authRequired()) return;
  const jar = await cookies();
  if (!(await verifySessionToken(jar.get(SESSION_COOKIE)?.value))) {
    throw new Error("Not signed in.");
  }
}

export async function getClock(): Promise<{ tz: string; today: string; hour: number; nowMs: number }> {
  const jar = await cookies();
  const raw = jar.get(TZ_COOKIE)?.value;
  const tz = raw ? decodeURIComponent(raw) : "UTC";
  return { tz, today: todayInTz(tz), hour: hourInTz(tz), nowMs: Date.now() };
}
