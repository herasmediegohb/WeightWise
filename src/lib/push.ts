import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/**
 * VAPID keys identify this app to the browsers' push services. They're
 * generated once and kept in the database, so there's nothing to configure.
 */
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const db = await getDb();
  const read = async () =>
    (await db.select().from(schema.appState).where(eq(schema.appState.key, "vapid")).limit(1))[0]?.value as
      | { publicKey: string; privateKey: string }
      | undefined;
  const existing = await read();
  if (existing) return existing;
  const { generateVAPIDKeys } = await import("web-push");
  const keys = generateVAPIDKeys();
  await db.insert(schema.appState).values({ key: "vapid", value: keys }).onConflictDoNothing();
  // Another request may have created keys at the same moment; use whichever won.
  return (await read())!;
}

/**
 * Sends to every device that turned notifications on. Subscriptions the
 * push service reports as gone (the app was removed, permission revoked)
 * are deleted. Returns how many devices accepted the message.
 */
export async function sendPush(payload: PushPayload, origin: string): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  const subs = await db.select().from(schema.pushSubscriptions);
  if (!subs.length) return { sent: 0, failed: 0 };
  const webpush = await import("web-push");
  const { publicKey, privateKey } = await getVapidKeys();
  // Push services require an https: or mailto: contact. Deployed apps always
  // have their https address; local development gets a placeholder.
  const subject = origin.startsWith("https://") ? origin : "mailto:weightwise@localhost.invalid";
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload),
          {
            vapidDetails: { subject, publicKey, privateKey },
            TTL: 6 * 3600,
            urgency: "normal",
            topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
          },
        );
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
        } else {
          console.error("[push]", status ?? "", (err as Error).message);
        }
      }
    }),
  );
  return { sent, failed };
}
