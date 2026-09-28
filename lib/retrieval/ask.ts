import { z } from "zod";
import { AIError } from "@/lib/ai/errors";
import type { QuestionClassification } from "@/lib/ai/prompts/qa";
import { isAIConfigured } from "@/lib/ai/registry";
import { sermonAI } from "@/lib/ai/service";
import { estimateCostUsd, addUsage } from "@/lib/ai/pricing";
import { AppError } from "@/lib/http/errors";
import { assertOwnsSermon, type ServiceContext } from "@/lib/sermons/service";
import { formatTimestampRange } from "@/lib/time/timestamps";
import type { Enums } from "@/lib/supabase/types";
import { vectorLiteral } from "./chunk";

/**
 * Ask AI: classify → hybrid retrieval (vector + full text) → grounded answer → citation check
 * → persist. The model may cite only the evidence keys it was given; unknown markers are
 * stripped, and an answer with no valid citation is marked low confidence.
 */

export const askSchema = z.object({
  question: z.string().trim().min(2).max(1000),
  threadId: z.uuid().optional(),
});

export type AskEvent =
  | { type: "stage"; stage: "understanding" | "searching" | "answering" }
  | { type: "answer"; data: AskResult }
  | { type: "error"; code: string; message: string };

export interface AnswerCitation {
  key: string;
  label: string;
  sourceType: Enums<"source_type">;
  sourceId: string;
  timestampStart: number | null;
  timestampEnd: number | null;
  noteBlockId: string | null;
  page: number | null;
  excerpt: string;
}

export interface AskResult {
  threadId: string;
  messageId: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  supportedBySermon: boolean;
  generalBackground: string | null;
  followUps: string[];
  citations: AnswerCitation[];
  questionType: QuestionClassification["question_type"];
}

interface RetrievedChunk {
  id: string;
  source_id: string;
  source_type: Enums<"source_type">;
  text: string;
  timestamp_start: number | null;
  timestamp_end: number | null;
  note_block_ids: string[];
  page: number | null;
  section_title: string | null;
  score: number;
}

const TYPE_BOOST: Partial<Record<QuestionClassification["question_type"], Partial<Record<Enums<"source_type">, number>>>> = {
  user_notes: { USER_NOTE: 2.0 },
  photo: { PHOTO: 2.0 },
  timeline: { SERMON_VIDEO: 1.5, UPLOADED_VIDEO: 1.5, UPLOADED_AUDIO: 1.5 },
  sermon_content: { SERMON_VIDEO: 1.3, UPLOADED_VIDEO: 1.3, UPLOADED_AUDIO: 1.3 },
};

function labelFor(chunk: RetrievedChunk, sourceLabels: Map<string, string>): string {
  const approx = formatTimestampRange(chunk.timestamp_start, chunk.timestamp_end, { approximate: true });
  switch (chunk.source_type) {
    case "SERMON_VIDEO":
    case "UPLOADED_VIDEO":
    case "UPLOADED_AUDIO":
      return approx ? `Sermon ${approx}` : "Sermon";
    case "USER_NOTE":
      return chunk.section_title?.startsWith("Your note") || !chunk.section_title ? (chunk.section_title ?? "Your note") : chunk.section_title;
    case "PHOTO":
      return sourceLabels.get(chunk.source_id) ?? "Photo";
    case "DOCUMENT":
      return `${sourceLabels.get(chunk.source_id) ?? "Document"}${chunk.page ? `, page ${chunk.page}` : ""}`;
    default:
      return sourceLabels.get(chunk.source_id) ?? "Source";
  }
}

export async function askQuestion(
  ctx: ServiceContext,
  sermonId: string,
  input: z.infer<typeof askSchema>,
  emit: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<AskResult> {
  await assertOwnsSermon(ctx, sermonId);
  if (!isAIConfigured()) throw new AppError("ai_not_configured", "Ask AI isn't available because AI processing isn't set up.");

  // Nothing indexed yet: explain why instead of producing an empty "answer".
  const { count } = await ctx.supabase.from("source_chunks").select("id", { count: "exact", head: true }).eq("sermon_id", sermonId);
  if (!count) {
    const { count: pending } = await ctx.supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("sermon_id", sermonId)
      .in("status", ["queued", "running"]);
    throw new AppError(
      "conflict",
      pending
        ? "This sermon is still being prepared for search. Try again in a few seconds."
        : "There's nothing from this sermon to search yet. Add notes or photos, or finish the sermon so the recording can be analyzed.",
    );
  }

  // Thread + the user's message.
  let threadId = input.threadId;
  if (threadId) {
    const { data } = await ctx.supabase.from("chat_threads").select("id").eq("id", threadId).eq("sermon_id", sermonId).maybeSingle();
    if (!data) throw new AppError("not_found", "That conversation couldn't be found.");
  } else {
    const [t] = await ctx.sql<{ id: string }[]>`
      insert into public.chat_threads (sermon_id, user_id, title) values (${sermonId}, ${ctx.userId}, ${input.question.slice(0, 200)})
      returning id`;
    threadId = t!.id;
  }
  const { data: history } = await ctx.supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(6);
  await ctx.sql`
    insert into public.chat_messages (thread_id, sermon_id, user_id, role, content)
    values (${threadId}, ${sermonId}, ${ctx.userId}, 'user', ${input.question})`;
  await ctx.sql`update public.chat_threads set updated_at = now() where id = ${threadId}`;

  emit({ type: "stage", stage: "understanding" });
  let classification: QuestionClassification = { question_type: "sermon_content", search_query: input.question, wants_timestamp: false };
  let usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 };
  try {
    const c = await sermonAI.classifyQuestion(input.question, signal);
    classification = c.output;
    usage = addUsage(usage, c.usage);
  } catch {
    // Classification is an optimization; retrieval still works with the raw question.
  }

  emit({ type: "stage", stage: "searching" });
  let embedding: string | null = null;
  try {
    const e = await sermonAI.embed([classification.search_query || input.question], "query", signal);
    if (e.vectors[0]) embedding = vectorLiteral(e.vectors[0]);
  } catch {
    // Fall back to full-text retrieval only.
  }
  const { data: rows, error } = await ctx.supabase.rpc("match_source_chunks", {
    p_sermon_id: sermonId,
    p_query_text: `${classification.search_query} ${input.question}`.slice(0, 1000),
    p_query_embedding: embedding ?? undefined,
    p_match_count: 20,
  });
  if (error) throw error;
  const boosts = TYPE_BOOST[classification.question_type] ?? {};
  const chunks = ((rows ?? []) as RetrievedChunk[])
    .map((r) => ({ ...r, score: r.score * (boosts[r.source_type] ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const [{ data: sources }, { data: sermon }, { data: ideas }, { data: scripture }] = await Promise.all([
    ctx.supabase.from("sermon_sources").select("id, label").eq("sermon_id", sermonId),
    ctx.supabase.from("sermons").select("title, speaker, big_idea").eq("id", sermonId).single(),
    ctx.supabase.from("main_ideas").select("title").eq("sermon_id", sermonId).eq("hidden", false).order("position").limit(7),
    ctx.supabase.from("scripture_references").select("normalized_reference").eq("sermon_id", sermonId).eq("hidden", false).order("position").limit(15),
  ]);
  const sourceLabels = new Map((sources ?? []).map((s) => [s.id, s.label]));
  const evidence = chunks.map((c, i) => ({ key: `K${i + 1}`, chunk: c, label: labelFor(c, sourceLabels) }));

  emit({ type: "stage", stage: "answering" });
  const run = await sermonAI.answerQuestion(
    {
      question: input.question,
      questionType: classification.question_type,
      sermon: { title: sermon?.title || null, speaker: sermon?.speaker ?? null },
      overview: {
        bigIdea: sermon?.big_idea ?? null,
        mainIdeas: (ideas ?? []).map((i) => i.title),
        scriptures: (scripture ?? []).map((s) => s.normalized_reference),
      },
      evidence: evidence.map((e) => ({ key: e.key, label: e.label, text: e.chunk.text })),
      history: (history ?? []).reverse().map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    },
    signal,
  );
  usage = addUsage(usage, run.usage);

  // Citation validation: keep only keys we provided; strip any other markers from the text.
  const provided = new Map(evidence.map((e) => [e.key, e]));
  const markerKeys = [...run.output.answer.matchAll(/\[(K\d+)\]/g)].map((m) => m[1]!);
  const validKeys = [...new Set([...run.output.cited_keys, ...markerKeys])].filter((k) => provided.has(k));
  const answerText = run.output.answer.replace(/\[(K\d+)\]/g, (m, k: string) => (provided.has(k) ? m : "")).replace(/ {2,}/g, " ");
  const invalid = [...new Set([...run.output.cited_keys, ...markerKeys])].filter((k) => !provided.has(k));

  const citations: AnswerCitation[] = validKeys.map((k) => {
    const e = provided.get(k)!;
    return {
      key: k,
      label: e.label,
      sourceType: e.chunk.source_type,
      sourceId: e.chunk.source_id,
      timestampStart: e.chunk.timestamp_start,
      timestampEnd: e.chunk.timestamp_end,
      noteBlockId: e.chunk.note_block_ids[0] ?? null,
      page: e.chunk.page,
      excerpt: e.chunk.text.slice(0, 280),
    };
  });
  const supported = run.output.supported_by_sermon && citations.length > 0;
  const confidence = supported ? run.output.confidence : "low";

  return persistAnswer(ctx, sermonId, threadId, {
    answer: answerText.trim(),
    confidence,
    supportedBySermon: supported,
    generalBackground: run.output.general_background,
    followUps: run.output.follow_ups,
    citations,
    questionType: classification.question_type,
    meta: {
      provider: run.provider,
      model: run.model,
      promptVersion: run.promptVersion,
      usage: { ...usage, estimated_cost_usd: estimateCostUsd(run.model, usage) },
      invalidCitations: invalid.length,
      retrieved: chunks.length,
      usedEmbedding: embedding !== null,
    },
  });
}

async function persistAnswer(
  ctx: ServiceContext,
  sermonId: string,
  threadId: string,
  a: Omit<AskResult, "threadId" | "messageId"> & {
    meta: { provider: string; model: string; promptVersion: string; usage: Record<string, unknown>; invalidCitations: number; retrieved: number; usedEmbedding: boolean } | null;
  },
): Promise<AskResult> {
  const messageId = await ctx.sql.begin(async (tx) => {
    const [msg] = await tx<{ id: string }[]>`
      insert into public.chat_messages (thread_id, sermon_id, user_id, role, content, answer, provider, model, prompt_version, usage)
      values (${threadId}, ${sermonId}, ${ctx.userId}, 'assistant', ${a.answer},
              ${tx.json({
                confidence: a.confidence,
                sermon_supported: a.supportedBySermon,
                general_background: a.generalBackground,
                follow_ups: a.followUps,
                question_type: a.questionType,
                citation_stats: a.meta ? { invalid: a.meta.invalidCitations, valid: a.citations.length, retrieved: a.meta.retrieved, used_embedding: a.meta.usedEmbedding } : null,
              } as never)},
              ${a.meta?.provider ?? null}, ${a.meta?.model ?? null}, ${a.meta?.promptVersion ?? null}, ${tx.json((a.meta?.usage ?? {}) as never)})
      returning id`;
    if (a.citations.length) {
      await tx`insert into public.source_citations ${tx(
        a.citations.map((c, i) => ({
          sermon_id: sermonId,
          user_id: ctx.userId,
          subject_type: "chat_message",
          subject_id: msg!.id,
          subject_part: c.key,
          source_id: c.sourceId,
          source_key: c.key,
          note_block_id: c.noteBlockId,
          timestamp_start: c.timestampStart,
          timestamp_end: c.timestampEnd,
          page: c.page,
          excerpt: c.excerpt,
          confidence: null,
          position: i,
        })),
      )}`;
    }
    return msg!.id;
  });
  return { ...a, threadId, messageId };
}

export function askErrorMessage(err: unknown): { code: string; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  if (err instanceof AIError) return { code: err.code, message: err.message };
  return { code: "internal", message: "Something went wrong while answering. Please try again." };
}
