"use client";

import { ArrowUp, Info } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { SourceChip, VoiceTag, type ChipCitation } from "@/components/sources/source-chip";
import { Notice } from "@/components/ui/notice";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/client/cn";

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence: string | null;
  supportedBySermon: boolean | null;
  generalBackground: string | null;
  followUps: string[];
  citations: (ChipCitation & { key: string })[];
}

const STAGE_TEXT = {
  understanding: "Understanding your question",
  searching: "Searching your sermon, notes, and photos",
  answering: "Writing an answer from what it found",
} as const;

const SUGGESTIONS = [
  "What was the main point?",
  "Which verses supported the second point?",
  "What did I write about this passage?",
  "What was on the slide I photographed?",
  "Make me a study plan for this week.",
];

/** Renders answer text, turning [K3] markers into inline source chips. Never raw HTML. */
function AnswerText({ text, citations, sermonId }: { text: string; citations: ThreadMessage["citations"]; sermonId: string }) {
  const byKey = new Map(citations.map((c) => [c.key, c]));
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="reading flex flex-col gap-3 text-md leading-relaxed">
      {paragraphs.map((para, i) => {
        const nodes: ReactNode[] = [];
        let last = 0;
        for (const m of para.matchAll(/\[(K\d+)\]/g)) {
          nodes.push(para.slice(last, m.index));
          const c = byKey.get(m[1]!);
          if (c) nodes.push(<span key={`${i}-${m.index}`} className="mx-0.5 inline-block align-middle font-ui"><SourceChip c={c} sermonId={sermonId} /></span>);
          last = (m.index ?? 0) + m[0].length;
        }
        nodes.push(para.slice(last));
        const isList = /^\s*[-•*]\s/.test(para);
        return isList ? (
          <ul key={i} className="list-disc pl-5">
            {para.split("\n").map((line, j) => (
              <li key={j}>{line.replace(/^\s*[-•*]\s/, "")}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{nodes}</p>
        );
      })}
    </div>
  );
}

function Answer({ m, sermonId, onAsk }: { m: ThreadMessage; sermonId: string; onAsk: (q: string) => void }) {
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <VoiceTag voice="ai">AI answer</VoiceTag>
        {m.confidence === "low" || m.supportedBySermon === false ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-caution">
            <Info className="size-3.5" aria-hidden="true" />
            {m.supportedBySermon === false ? "Not found in this sermon" : "Low confidence"}
          </span>
        ) : null}
      </div>
      <AnswerText text={m.content} citations={m.citations} sermonId={sermonId} />
      {m.citations.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-ink-muted">Sources</p>
          <ul className="flex flex-wrap gap-1.5">
            {m.citations.map((c) => (
              <li key={c.key}>
                <SourceChip c={c} sermonId={sermonId} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {m.generalBackground ? (
        <div className="rounded-[12px] border border-rule bg-paper-sunk p-3">
          <p className="label-caps">General background — not from this sermon</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{m.generalBackground}</p>
        </div>
      ) : null}
      {m.followUps.length ? (
        <div className="flex flex-wrap gap-2">
          {m.followUps.map((f) => (
            <button key={f} type="button" onClick={() => onAsk(f)} className="rounded-full border border-rule-strong px-3 py-1.5 text-sm text-ink-muted hover:border-pen hover:text-pen">
              {f}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function AskPanel({ sermonId, threadId: initialThread, initial }: { sermonId: string; threadId: string | null; initial: ThreadMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [threadId, setThreadId] = useState(initialThread);
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState<keyof typeof STAGE_TEXT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, stage]);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || stage) return;
    setError(null);
    setQuestion("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text, confidence: null, supportedBySermon: null, generalBackground: null, followUps: [], citations: [] }]);
    setStage("understanding");
    try {
      const res = await fetch(`/api/sermons/${sermonId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, threadId: threadId ?? undefined }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Couldn't reach Ask AI.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as
            | { type: "stage"; stage: keyof typeof STAGE_TEXT }
            | { type: "error"; message: string }
            | { type: "answer"; data: { threadId: string; messageId: string; answer: string; confidence: string; supportedBySermon: boolean; generalBackground: string | null; followUps: string[]; citations: (ChipCitation & { key: string; sourceLabel?: string; label: string })[] } };
          if (event.type === "stage") setStage(event.stage);
          else if (event.type === "error") throw new Error(event.message);
          else {
            setThreadId(event.data.threadId);
            setMessages((m) => [
              ...m,
              {
                id: event.data.messageId,
                role: "assistant",
                content: event.data.answer,
                confidence: event.data.confidence,
                supportedBySermon: event.data.supportedBySermon,
                generalBackground: event.data.generalBackground,
                followUps: event.data.followUps,
                citations: event.data.citations.map((c) => ({ ...c, sourceLabel: c.label })),
              },
            ]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStage(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      {messages.length === 0 ? (
        <section aria-labelledby="ask-intro" className="flex flex-col gap-3">
          <h2 id="ask-intro" className="text-lg font-bold">
            Ask anything about this sermon
          </h2>
          <p className="text-ink-muted">Answers come from the sermon, your notes, and your photos, with links back to each source. When the sermon didn’t cover something, it says so.</p>
          <ul className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => void ask(s)} className="rounded-full border border-rule-strong px-3.5 py-2 text-sm text-ink hover:border-pen hover:text-pen">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="flex flex-col gap-8" aria-live="polite">
        {messages.map((m) => (
          <li key={m.id}>
            {m.role === "user" ? (
              <p className="ml-auto w-fit max-w-[85%] rounded-[16px] rounded-br-[6px] bg-paper-sunk px-4 py-2.5 text-[0.9375rem]">{m.content}</p>
            ) : (
              <Answer m={m} sermonId={sermonId} onAsk={(q) => void ask(q)} />
            )}
          </li>
        ))}
        {stage ? (
          <li className="flex items-center gap-2 text-sm text-ink-muted" role="status">
            <Spinner />
            {STAGE_TEXT[stage]}…
          </li>
        ) : null}
      </ol>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div ref={bottom} />

      <form onSubmit={submit} className="sticky bottom-3 mt-auto flex items-end gap-2 rounded-[16px] border border-field bg-paper-raised p-2 shadow-[var(--shadow-float)] focus-within:border-pen">
        <label htmlFor="ask-input" className="sr-only">
          Ask about this sermon
        </label>
        <textarea
          id="ask-input"
          ref={input}
          rows={1}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="Ask anything about this sermon…"
          maxLength={1000}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || Boolean(stage)}
          aria-label="Ask"
          className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-pen text-on-pen transition-opacity", (!question.trim() || stage) && "opacity-40")}
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
