"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkle, Stop, Trash } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { clearChat } from "@/app/actions";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const PROMPTS = [
  "Why has my weight stalled?",
  "Give me meal ideas for what I have left today.",
  "Am I eating enough protein?",
  "Is my calorie target right for my pace?",
];

export function Chat({
  initial,
  aiEnabled,
  ask,
}: {
  initial: Msg[];
  aiEnabled: boolean;
  /** A question to send straight away, from a shortcut elsewhere in the app. */
  ask?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (ask && aiEnabled && !askedRef.current) {
      askedRef.current = true;
      router.replace("/coach", { scroll: false });
      send(ask);
    }
    // Runs once for the shortcut question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, { id: replyId, role: "assistant", content: "" }]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "";
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const setReply = (content: string) =>
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content } : x)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "The coach couldn't answer. Try again.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReply(acc);
      }
      if (!acc) setReply("No reply came back. Try asking again.");
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        setMessages((m) => m.filter((x) => x.id !== replyId || x.content));
      } else {
        setMessages((m) => m.filter((x) => x.id !== replyId));
        setInput(message);
        toast.error(e instanceof TypeError ? "You seem to be offline. Your message is still in the box." : err.message);
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section aria-label="Chat with your coach">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Ask your coach</h2>
        {messages.length > 0 && (
          <button
            type="button"
            disabled={streaming}
            onClick={async () => {
              if (!window.confirm("Clear the whole conversation?")) return;
              await clearChat();
              setMessages([]);
            }}
            className="-mr-2 flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-fg disabled:opacity-40"
          >
            <Trash size={16} aria-hidden />
            Clear
          </button>
        )}
      </div>

      {!aiEnabled ? (
        <div className="rounded-3xl border border-border bg-surface p-5 text-[15px]">
          <p className="font-semibold">The coach isn&apos;t set up yet</p>
          <p className="mt-1 text-muted">
            Add an <code className="font-mono text-fg">ANTHROPIC_API_KEY</code> environment variable in your Vercel project and
            redeploy. Everything else in the app works without it.
          </p>
        </div>
      ) : (
        <>
          {messages.length === 0 ? (
            <div>
              <p className="text-[15px] text-muted">
                The coach can see your weigh-ins, food and water logs, and targets. Ask anything, or start with one of these.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {PROMPTS.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => send(q)}
                      className="flex min-h-13 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 text-left text-[15px] font-medium transition-[transform,background-color] hover:bg-surface-2 active:scale-[0.99]"
                    >
                      <Sparkle size={18} weight="fill" className="shrink-0 text-accent" aria-hidden />
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="space-y-3" aria-live="polite">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-lime px-4 py-2.5 text-[15px] leading-relaxed text-on-lime">
                      {m.content}
                    </p>
                  ) : (
                    <div className="prose-coach max-w-[92%] rounded-3xl rounded-bl-lg border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed">
                      {m.content ? (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      ) : (
                        <span className="flex h-6 items-center gap-1" role="status" aria-label="The coach is thinking">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="size-1.5 rounded-full bg-muted" style={{ animation: `pulse-dot 1.2s ${i * 0.15}s infinite` }} />
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} className="h-24 lg:h-6" />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-bg/90 px-4 py-2.5 backdrop-blur-xl lg:sticky lg:bottom-4 lg:rounded-3xl lg:border lg:bg-surface lg:px-3"
          >
            <div className="mx-auto flex max-w-xl items-end gap-2 lg:max-w-none">
              <label htmlFor="chat-input" className="sr-only">
                Message your coach
              </label>
              <textarea
                id="chat-input"
                ref={taRef}
                rows={1}
                value={input}
                placeholder="Ask about your progress"
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-base leading-snug placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:outline-none lg:bg-surface-2"
              />
              {streaming ? (
                <button
                  type="button"
                  aria-label="Stop the reply"
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-fg active:scale-95"
                >
                  <Stop size={18} weight="fill" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-on-lime transition-[transform,opacity] active:scale-95 disabled:opacity-40"
                >
                  <ArrowUp size={20} weight="bold" />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
