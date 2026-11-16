import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AI_NOT_CONFIGURED, MODEL, aiConfigured, aiErrorMessage, anthropic } from "@/lib/ai";
import { COACH_SYSTEM, buildCoachContext } from "@/lib/coach";
import { getChat, getProfile } from "@/lib/data";
import { assertAuthed, getClock } from "@/lib/session";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await assertAuthed();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!aiConfigured()) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  if (message.length > 4000) {
    return NextResponse.json({ error: "That message is too long." }, { status: 400 });
  }

  const p = await getProfile();
  if (!p) return NextResponse.json({ error: "Finish setting up your profile first." }, { status: 400 });
  const { today } = await getClock();
  const [history, context, db] = await Promise.all([getChat(30), buildCoachContext(p, today), getDb()]);

  const [saved] = await db
    .insert(schema.chatMessages)
    .values({ role: "user", content: message })
    .returning({ id: schema.chatMessages.id });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    // If the model declines a request, the API retries it on its default
    // fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: COACH_SYSTEM },
      { type: "text", text: context },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  let full = "";
  let failed = false;
  let hadText = false;
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !full) {
          full = "I can't help with that one. Try asking it a different way.";
          controller.enqueue(encoder.encode(full));
        }
      } catch (err) {
        console.error("[chat]", err);
        failed = true;
        hadText = Boolean(full);
        const msg = aiErrorMessage(err);
        const add = full ? `\n\n_${msg}_` : msg;
        full += add;
        controller.enqueue(encoder.encode(add));
      } finally {
        // Keep history clean: a reply that failed before producing anything
        // is not saved, and neither is the question that triggered it.
        if (full && (!failed || hadText)) {
          await db.insert(schema.chatMessages).values({ role: "assistant", content: full }).catch(() => {});
        } else {
          await db.delete(schema.chatMessages).where(eq(schema.chatMessages.id, saved.id)).catch(() => {});
        }
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
