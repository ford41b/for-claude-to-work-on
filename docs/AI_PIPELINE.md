# AI pipeline

How sermon evidence becomes a Sermon Pack, and how every AI feature reads from it. The overview
diagram and model tiers are in [ARCHITECTURE.md §E](ARCHITECTURE.md#e-ai-pipeline), and the
job mechanics in [§F](ARCHITECTURE.md#f-job-architecture). The trust rules applied to model
output are in [SOURCE_GROUNDING.md](SOURCE_GROUNDING.md).

## Principles

1. **Analyze each source once.** Media analysis is the expensive step. Results are cached as
   `ai_artifacts`, keyed by the source's identity (YouTube id, or file SHA-256 and path), the
   prompt version, and the model. Re-running the pipeline never re-bills a recording that
   hasn't changed.
2. **Synthesize over text, never over media.** The Sermon Pack prompt reads the cached
   analyses plus notes, photo transcriptions and documents. Editing a note rebuilds the pack
   cheaply.
3. **Code enforces trust; prompts only ask for it.** Every model output is schema-validated.
   Every citation, quote, timestamp and Scripture reference is then checked against the
   evidence in code before it's stored (`lib/pack/resolve.ts`).
4. **No single point of failure.** Without an AI provider, notes, photos, library search,
   deterministic Scripture detection and playback all still work. Each AI failure maps to a
   user-safe message and a next action.

## Provider abstraction

`lib/ai/types.ts` defines `ModelProvider`:

```ts
interface ModelProvider {
  id; label; supportsYouTubeUrls; embeddingModel; embeddingDimensions;
  modelFor(tier: "media" | "synthesis" | "fast"): string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;   // text + JSON-schema output
  embed(req: EmbedRequest): Promise<EmbedResponse>;            // 768-d, L2-normalized
  prepareMedia(input): Promise<PreparedMedia>;                 // e.g. upload to a files API
  releaseMedia(ref): Promise<void>;                            // delete it afterwards
}
```

Product code never imports a provider. It calls the `sermonAI` facade (`lib/ai/service.ts`),
which resolves the configured provider through `lib/ai/registry.ts`.

| Provider | Where | Status |
|---|---|---|
| Google Gemini (`@google/genai`) | `lib/ai/providers/gemini` | Implemented. Unit-tested for error classification and schema conversion. **Not yet exercised against the live API in this repository** (no key was available). |
| Fixture | `lib/ai/providers/fixture` | Deterministic synthetic output for automated tests. Needs `AI_PROVIDER=fixture` **and** `ALLOW_FIXTURE_AI=true`, and the UI shows a "Test AI provider active" banner. Never for production. |

**Adding a provider** (OpenAI, Anthropic, a self-hosted model, …):

1. Implement `ModelProvider` in `lib/ai/providers/<name>/`. Map its errors onto `AIError`
   codes; `classifyGeminiError` is a reference.
2. Add a case to `getModelProvider()` and a value to `AI_PROVIDER` in `lib/config/env.ts`.
3. Run `npm run eval -- --provider=<name>`. Media analysis also needs `prepareMedia` for
   uploaded files; if the provider can't take YouTube URLs, set `supportsYouTubeUrls = false`,
   and the app will ask for an upload instead.

Embeddings are fixed at **768 dimensions** (`source_chunks.embedding vector(768)`). A provider
with another native size must truncate or project and then L2-normalize, as the Gemini adapter
does with `outputDimensionality: 768`. Changing the dimension means a migration and a full
re-embed.

## Prompts

All prompts live in `lib/ai/prompts/`. Each is a `PromptDefinition` with an `id`, a `version`,
a model `tier`, a Zod `schema`, generation `options`, and a pure `build(input)` that returns
the system instruction and content parts. `PROMPT_REGISTRY` in `lib/ai/service.ts` lists them all.

| Prompt | Version | Tier | Input | Output |
|---|---|---|---|---|
| `sermon-analysis` | 2026-09-28.1 | media | YouTube URL or uploaded audio/video, known metadata | Timestamped segments (kind, summary, phrases heard word-for-word, Scripture mentioned, on-screen text, timing confidence), sermon start/end, quotes with a `heard_verbatim` flag, illustrations, metadata guesses with a basis |
| `image-analysis` | 2026-09-28.1 | media | Photo (high media resolution) | Photo kind, title, typed text blocks with per-block confidence and `[unclear]` markers, handwriting flag |
| `document-analysis` | 2026-09-28.1 | media | PDF | Per-page text |
| `sermon-pack:core`, `sermon-pack:details` | 2026-10-03.1 | synthesis | Source catalog units (keys `V#`, `N#`, `P#`, `D#.p#`, `C#`) and the deterministic Scripture detections | The Sermon Pack draft, in two parts run at the same time: *core* (metadata, big idea, summaries, main ideas, outline, moments, Scripture; medium thinking) and *details* (quotes, illustrations, applications, questions, terms, review items; low thinking). `lib/ai/tasks/sermon-pack.ts` merges them and validates the whole pack; if one part fails, the other is cancelled. One request for everything could outlast a 300 s serverless function. Every item carries `source_keys`. |
| `qa-classify` | 2026-09-28.1 | fast | A question | Question type, search query, whether a time is wanted |
| `qa-answer` | 2026-09-28.1 | synthesis | Retrieved evidence units (`K#`), overview, history | Markdown answer with `[K#]` markers, `cited_keys`, confidence, `supported_by_sermon`, separate `general_background` |
| `bible-study` | 2026-09-28.1 | synthesis | Pack summary, Scripture, cited units, format | A study in one of 8 formats; each section carries `source_keys` |

The shared rules in `prompts/shared.ts` (`VOICE_AND_TRUST_RULES`, `CITATION_RULES`) go into
every generation prompt. They require the model to attribute claims to the sermon, never put
words in the speaker's mouth, never invent Scripture or quotes, and cite only keys it was
given.

**Changing a prompt:** bump its `version` (date plus counter). The version is part of every
cache key and every artifact row. Media analyses then re-run on next use, and packs rebuild
because `source_version_hash` includes the pack prompt version. Before merging, run
`npm run eval` against a real provider.

## Structured output

`runPrompt()` (`lib/ai/structured.ts`):

1. Converts the Zod schema to JSON Schema (`z.toJSONSchema`, output mode), then sanitizes it
   for provider limits (`toProviderSchema`), and sends it as the response schema.
2. Extracts JSON from the reply, tolerating code fences and stray prose, and validates it
   with the Zod schema. Enums are lenient (`lenientEnum`), so letter case or near-miss values
   are coerced instead of failing a whole pack.
3. On failure, runs **one repair pass** on the `fast` tier. That pass shows the model its own
   output and the exact violations, with instructions not to invent facts.
4. If the output is still invalid, throws `AIError("invalid_output")`, which is retryable, so
   the job backs off and tries again.

Every run returns provider, model, prompt id and version, token usage, latency, and whether a
repair was needed. Jobs store these with the estimated cost from `lib/ai/pricing.ts`, which
returns `null` for unknown models rather than guessing.

## Errors and retries

`lib/ai/errors.ts` classifies failures. `message` is shown to users. `detail` (the provider's
own error text, with the model and prompt id) is stored in `jobs.result.error_detail`, written
to the `job.failed` log line, and shown under "Technical details" on a failed processing step
(AI errors only; internal errors stay in the logs).

Before a request fails, the Gemini adapter retries a refused form of it (400 INVALID_ARGUMENT,
or a 500 INTERNAL, which Gemini returns for some large-schema requests) without the optional
tuning, then with the schema moved into the prompt. 503/504 and network errors are not
reshaped; they back off and retry. Network errors are classified from their `cause` chain, so a
stalled connection is a `timeout` rather than a generic outage. A job stopped by a time limit
records which one ("this step's time limit" or "the server function's remaining run time") and
how long it ran. While a step waits to retry, the processing card says which try is next and
shows "Why the last try stopped". Once retries run out, the step says so plainly ("didn't
respond after several tries") instead of promising another retry.

| Code | Retry | Typical cause | What the user sees |
|---|---|---|---|
| `unavailable`, `rate_limited`, `timeout`, `invalid_output` | Yes (backoff ~30 s, ~2 m, ~8 m…, capped at 30 min, 3 attempts by default) | 5xx, 429, slow media, malformed JSON | "We'll retry automatically" |
| `quota_exceeded`, `auth_failed`, `not_configured` | No | Billing limits, a bad key, no provider | An admin-facing message; notes still work |
| `media_private`, `media_unavailable`, `media_unsupported`, `media_too_long`, `content_blocked` | No | Private or removed video, bad file, provider refusal | The source is marked **unavailable** and offers to upload a recording or continue with notes and photos |

## The pipeline, step by step

| Job | Handler | What it does |
|---|---|---|
| `INGEST_SERMON` | `ingest-sermon.ts` | Reads official metadata (YouTube Data API, otherwise oEmbed, otherwise nothing) and applies it without touching fields the user set. Decides whether direct URL analysis is possible (public, not live), then queues `ANALYZE_VIDEO`. |
| `ANALYZE_VIDEO` / `ANALYZE_AUDIO` | `analyze-media.ts` | Checks the cache. On a miss, passes the YouTube URL straight to the provider, or downloads the verified upload to a temp file and calls `prepareMedia`, which uploads it to the Gemini Files API. Runs `sermon-analysis`, normalizes the result (`normalizeMediaAnalysis`: MM:SS → seconds, clamped to the duration, malformed spans dropped), stores the artifact, and **always** calls `releaseMedia` in `finally`. |
| `PROCESS_PHOTO` | `process-photo.ts` | Builds the EXIF-stripped WebP preview, runs `image-analysis`, and stores a new AI transcription version. If the user has already corrected the transcription, the new AI version is kept but does not become current. |
| `PROCESS_DOCUMENT` | `process-document.ts` | Extracts plain text and Markdown directly; PDFs go through `document-analysis`. Stores the pages. |
| `EXTRACT_SCRIPTURE` | `extract-scripture.ts` | Runs deterministic Scripture detection over every unit (no AI), so references appear early and survive with AI off, then queues the pack build |
| `BUILD_SERMON_PACK` | `build-pack.ts` | Builds the catalog. Skips if unchanged. Otherwise runs the two `sermon-pack` parts, resolves the merged draft (`resolvePack`), and persists a new pack version in one transaction that preserves user edits (`lib/pack/persist.ts`), then queues embeddings |
| `CREATE_EMBEDDINGS` | `create-embeddings.ts` | Chunks the catalog, reuses stored vectors for unchanged chunks (same content hash and embedding model), embeds only the rest, and replaces the sermon's chunk set in one transaction |
| `GENERATE_STUDY` | `generate-study.ts` | Runs `bible-study` over the pack and cited units, then resolves section citations the same way as the pack |

Ask AI (`lib/retrieval/ask.ts`) runs inside the request, not as a job:

1. Classifies the question (fast tier). If that fails it continues with the raw question.
2. Embeds the query. If that fails it falls back to full-text search only.
3. Runs `match_source_chunks`, a hybrid search over full text and vectors merged with RRF.
4. Weights results by source type for the question type (e.g. notes rank higher for "what
   did I write").
5. Answers from the top 10 units.
6. Validates citations: keys it never provided are stripped from the text and dropped.

It streams NDJSON stage events to the UI, and refuses clearly while search indexing is still
running.

## Cost controls

- Analysis is cached per source, prompt version, and model.
- Video runs at low media resolution; photos at high.
- Synthesis reads text; Ask AI classification uses the fast tier.
- Embeddings are computed only for changed chunks.
- Rebuilds after the sermon is finished are debounced, and packs whose inputs haven't changed
  are skipped.
- Per-user rate limits (`lib/config/app.ts`): `ask` 60/h, `study` 20/h, `finish` 30/h,
  `rebuild` 20/h, `upload` 300/h, `youtube` 40/h, `retry` 60/h, `export` 10/h.
- Estimated cost per fully processed video sermon: ≈ $0.45–0.60 at 2027 list prices (see
  ARCHITECTURE §J). Each job records its actual usage.

## Evaluation

`npm run eval` runs three suites (see [TESTING.md](TESTING.md#evals)):

- **scripture**: deterministic detection, 64 gold cases. Offline.
- **grounding**: adversarial pack drafts through the real resolver. Offline; any leak fails CI.
- **model**: pack synthesis and grounded Q&A through the configured provider, scored on raw
  key validity, verbatim honesty, Scripture recall and invention, unsupported claims, voice
  attribution, citing the expected source, refusing out-of-scope questions, latency, and cost.
  Run it with `--provider=gemini` before changing prompts or models.
