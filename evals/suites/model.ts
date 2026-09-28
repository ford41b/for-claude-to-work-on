import { estimateCostUsd, addUsage, ZERO_USAGE } from "@/lib/ai/pricing";
import { FixtureProvider } from "@/lib/ai/providers/fixture";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { answerQuestionPrompt, classifyQuestionPrompt, type QuestionClassification } from "@/lib/ai/prompts/qa";
import { sermonPackPrompt, type SermonPackDraft } from "@/lib/ai/prompts/sermon-pack";
import { runPrompt } from "@/lib/ai/structured";
import type { ModelProvider, TokenUsage } from "@/lib/ai/types";
import { findScripture, normalizeReference } from "@/lib/bible/reference";
import { resolvePack } from "@/lib/pack/resolve";
import { detectScripture } from "@/lib/pack/scripture-detect";
import { NOTEBOOK_DURATION, NOTEBOOK_QUESTIONS, NOTEBOOK_SERMON, NOTEBOOK_TRUTH } from "../datasets/notebook";
import { notebookCatalog, ratio, type CaseFailure, type SuiteResult } from "../lib";
import { verbatimSupported } from "./grounding";

/**
 * Model quality on the synthetic notebook: Sermon Pack synthesis and grounded Ask AI, run
 * through the real prompts and the configured provider. Raw-output metrics measure how honest
 * the model is before the resolver cleans up; the resolver's own guarantees are covered by the
 * grounding suite. Retrieval is not exercised here (every unit is offered as evidence); the
 * integration tests cover retrieval against a real database.
 */

export type ProviderChoice = "gemini" | "fixture";

export function resolveProvider(choice: string | undefined): { provider: ModelProvider | null; reason?: string } {
  const wanted = choice ?? process.env.AI_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "none");
  if (wanted === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { provider: null, reason: "GEMINI_API_KEY is not set" };
    return {
      provider: new GeminiProvider({
        apiKey,
        models: {
          media: process.env.GEMINI_MODEL_MEDIA || "gemini-3.8-flash",
          synthesis: process.env.GEMINI_MODEL_SYNTHESIS || "gemini-3.8-flash",
          fast: process.env.GEMINI_MODEL_FAST || "gemini-3.1-flash-lite",
        },
        embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
      }),
    };
  }
  if (wanted === "fixture") return { provider: new FixtureProvider() };
  return { provider: null, reason: "no AI provider configured (set GEMINI_API_KEY, or pass --provider=fixture to check the harness)" };
}

function draftKeys(d: SermonPackDraft): string[] {
  const keyed: { source_keys: string[] }[] = [
    d.big_idea, d.central_thesis, d.short_summary, d.detailed_summary,
    ...d.main_ideas, ...d.outline, ...d.moments, ...d.scriptures, ...d.quotes, ...d.illustrations,
    ...d.applications, ...d.questions_to_consider, ...d.terms, ...d.review_items,
  ];
  return keyed.flatMap((x) => x.source_keys.map((k) => k.trim().replace(/^\[|\]$/g, "")));
}

function draftItemCount(d: SermonPackDraft): number {
  return 4 + d.main_ideas.length + d.outline.length + d.moments.length + d.scriptures.length + d.quotes.length + d.illustrations.length +
    d.applications.length + d.questions_to_consider.length + d.terms.length + d.review_items.length;
}

export async function runModelSuite(provider: ModelProvider): Promise<SuiteResult> {
  const { units, refs } = notebookCatalog();
  const detections = detectScripture(units, refs);
  const sourceOsis = new Set(units.flatMap((u) => [u.text, ...(u.details ?? [])]).flatMap((t) => findScripture(t).map((m) => m.osis)));
  const failures: CaseFailure[] = [];
  let usage: TokenUsage = ZERO_USAGE;
  let cost = 0;
  let costKnown = true;
  const track = (model: string, u: TokenUsage) => {
    usage = addUsage(usage, u);
    const c = estimateCostUsd(model, u);
    if (c === null) costKnown = false;
    else cost += c;
  };

  // --- Sermon Pack --------------------------------------------------------------------------
  let draft: SermonPackDraft | null = null;
  let packLatency = 0;
  let packModel = "";
  try {
    const run = await runPrompt(provider, sermonPackPrompt, {
      sermon: NOTEBOOK_SERMON,
      hasRecording: true,
      recordingNote: null,
      units,
      detectedScripture: detections.map((d) => ({ reference: d.normalized, kind: d.kind, keys: [...new Set(d.citations.map((c) => c.sourceKey))].slice(0, 6) })),
    });
    draft = run.output;
    packLatency = run.latencyMs;
    packModel = run.model;
    track(run.model, run.usage);
    if (run.repaired) failures.push({ id: "pack-schema", detail: "output needed a repair pass" });
  } catch (err) {
    failures.push({ id: "pack-schema", detail: `synthesis failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  const packMetrics: SuiteResult["metrics"] = [];
  if (draft) {
    const keys = draftKeys(draft);
    const invalidKeys = keys.filter((k) => !refs.has(k));
    for (const k of new Set(invalidKeys)) failures.push({ id: "pack-keys", detail: `cited unknown key ${k}` });

    const plan = resolvePack(draft, { refs, durationSeconds: NOTEBOOK_DURATION, hasRecording: true, detections });
    const verbatimClaims = draft.quotes.filter((q) => q.quote_type === "VERBATIM_QUOTE");
    const verbatimOk = plan.quotes.filter((q) => q.fields.quote_type === "VERBATIM_QUOTE" && verbatimSupported(q.fields.text, q.citations, refs));
    for (const q of plan.quotes.filter((q) => q.fields.quote_type === "PARAPHRASE")) {
      if (verbatimClaims.some((c) => c.text.includes(q.fields.text) || q.fields.text.includes(c.text.replace(/[“”"]/g, "")))) {
        failures.push({ id: "pack-verbatim", detail: `claimed verbatim without evidence: “${q.fields.text}”` });
      }
    }

    const draftOsis = draft.scriptures.map((s) => normalizeReference(s.reference)?.osis ?? `invalid:${s.reference}`);
    const invented = draftOsis.filter((o) => !sourceOsis.has(o));
    for (const o of invented) failures.push({ id: "pack-scripture", detail: `named Scripture not in any source: ${o}` });
    const planOsis = new Set(plan.scriptures.map((s) => s.fields.osis));
    const recall = NOTEBOOK_TRUTH.scripture.filter((o) => planOsis.has(o));
    const primary = plan.scriptures.find((s) => s.fields.role === "primary")?.fields.osis ?? null;
    if (primary !== NOTEBOOK_TRUTH.primaryScripture) failures.push({ id: "pack-primary", detail: `primary passage ${primary ?? "none"}` });

    const prose = [draft.big_idea.text, draft.central_thesis.text, draft.short_summary.text, draft.detailed_summary.text, ...draft.main_ideas.flatMap((m) => [m.title, m.summary, m.explanation])].join("\n");
    const forbidden = NOTEBOOK_TRUTH.forbidden.filter((w) => prose.toLowerCase().includes(w.toLowerCase()));
    for (const w of forbidden) failures.push({ id: "pack-unsupported", detail: `mentions “${w}”, which no source supports` });
    const attributed = /\b(the sermon|the speaker|the pastor|the preacher)\b/i.test(draft.big_idea.text);
    if (!attributed) failures.push({ id: "pack-voice", detail: "big idea is not attributed to the sermon" });

    packMetrics.push(
      { name: "pack_schema_valid", value: 1, unit: "count", min: 1 },
      { name: "raw_key_validity", value: ratio(keys.length - invalidKeys.length, keys.length), unit: "ratio", min: 0.98 },
      { name: "items_without_sources", value: ratio(plan.stats.itemsWithoutSources, draftItemCount(draft)), unit: "ratio", max: 0.1 },
      { name: "raw_verbatim_precision", value: ratio(verbatimOk.length, verbatimClaims.length), unit: "ratio", min: 0.9, note: `${verbatimClaims.length} claimed` },
      { name: "scripture_recall", value: ratio(recall.length, NOTEBOOK_TRUTH.scripture.length), unit: "ratio", min: 0.8 },
      { name: "raw_invented_scripture", value: invented.length, unit: "count", max: 0 },
      { name: "primary_passage_correct", value: primary === NOTEBOOK_TRUTH.primaryScripture ? 1 : 0, unit: "count", min: 1 },
      { name: "unsupported_claims", value: forbidden.length, unit: "count", max: 0 },
      { name: "big_idea_attributed", value: attributed ? 1 : 0, unit: "count", min: 1 },
      { name: "pack_latency", value: packLatency, unit: "ms" },
    );
  } else {
    packMetrics.push({ name: "pack_schema_valid", value: 0, unit: "count", min: 1 });
  }

  // --- Ask AI ---------------------------------------------------------------------------------
  const evidence = units.map((u, i) => ({ key: `K${i + 1}`, label: u.label, text: [u.text, ...(u.details ?? [])].join("\n"), source: u.key }));
  const byK = new Map(evidence.map((e) => [e.key, e.source]));
  let inScope = 0;
  let inScopeSupported = 0;
  let expectedHit = 0;
  let outScope = 0;
  let outScopeRefused = 0;
  let invalidCited = 0;
  const latencies: number[] = [];
  for (const q of NOTEBOOK_QUESTIONS) {
    try {
      let questionType: QuestionClassification["question_type"] = "sermon_content";
      try {
        const c = await runPrompt(provider, classifyQuestionPrompt, { question: q.question });
        track(c.model, c.usage);
        questionType = c.output.question_type;
      } catch {
        // Mirrors production: classification failure falls back to sermon_content.
      }
      const run = await runPrompt(provider, answerQuestionPrompt, {
        question: q.question,
        questionType,
        sermon: { title: NOTEBOOK_SERMON.title, speaker: null },
        overview: { bigIdea: draft?.big_idea.text ?? null, mainIdeas: draft?.main_ideas.map((m) => m.title) ?? [], scriptures: [] },
        evidence: evidence.map(({ key, label, text }) => ({ key, label, text })),
        history: [],
      });
      track(run.model, run.usage);
      latencies.push(run.latencyMs);
      const cited = [...new Set([...run.output.cited_keys, ...[...run.output.answer.matchAll(/\[(K\d+)\]/g)].map((m) => m[1]!)])];
      const bad = cited.filter((k) => !byK.has(k));
      invalidCited += bad.length;
      for (const k of bad) failures.push({ id: q.id, detail: `cited unknown key ${k}` });
      const sources = cited.map((k) => byK.get(k)).filter((k): k is string => Boolean(k));
      if (q.inScope) {
        inScope++;
        const ok = run.output.supported_by_sermon && sources.length > 0;
        if (ok) inScopeSupported++;
        else failures.push({ id: q.id, detail: "answered as unsupported or without citations" });
        if (q.expectKeys.some((k) => sources.includes(k))) expectedHit++;
        else failures.push({ id: q.id, detail: `cited ${sources.join(", ") || "nothing"}; expected one of ${q.expectKeys.join(", ")}` });
      } else {
        outScope++;
        if (!run.output.supported_by_sermon) outScopeRefused++;
        else failures.push({ id: q.id, detail: `claimed the sermon covers it: “${run.output.answer.slice(0, 140)}”` });
      }
    } catch (err) {
      failures.push({ id: q.id, detail: `failed: ${err instanceof Error ? err.message : String(err)}` });
      if (q.inScope) inScope++;
      else outScope++;
    }
  }

  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  return {
    suite: "model",
    description: `Sermon Pack synthesis and grounded Ask AI via ${provider.label}`,
    info: {
      provider: provider.id,
      synthesis_model: packModel || provider.modelFor("synthesis"),
      prompt_versions: `${sermonPackPrompt.id}@${sermonPackPrompt.version}, ${answerQuestionPrompt.id}@${answerQuestionPrompt.version}`,
      tokens_in: usage.inputTokens,
      tokens_out: usage.outputTokens + usage.thinkingTokens,
      est_cost_usd: costKnown ? Number(cost.toFixed(4)) : null,
    },
    metrics: [
      ...packMetrics,
      { name: "qa_in_scope_supported", value: ratio(inScopeSupported, inScope), unit: "ratio", min: 1 },
      { name: "qa_expected_source_cited", value: ratio(expectedHit, inScope), unit: "ratio", min: 0.66 },
      { name: "qa_out_of_scope_refused", value: ratio(outScopeRefused, outScope), unit: "ratio", min: 1 },
      { name: "qa_invalid_citations", value: invalidCited, unit: "count", max: 0 },
      { name: "qa_avg_latency", value: avgLatency, unit: "ms" },
    ],
    failures,
  };
}
