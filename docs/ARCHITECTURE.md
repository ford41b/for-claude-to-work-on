# Architecture — Sermon Notebook

Working product name: **Sermon Notebook** (one constant, `APP_NAME` in `lib/config/app.ts`).

This document is the pre-implementation architecture requested in §96 of the master brief
(sections **A–L**). It is kept current as the code evolves. Status markers used throughout:

| Marker | Meaning |
|---|---|
| **[MVP]** | In the Phase 1 build. See `README.md → Feature status` for what is verified. |
| **[P2]…[P5]** | Later phase. Architecture accommodates it; no code ships for it yet. |
| **[OPT]** | Optional external integration behind an adapter; the core product never depends on it. |

Companion documents: [DATABASE.md](DATABASE.md), [AI_PIPELINE.md](AI_PIPELINE.md),
[SOURCE_GROUNDING.md](SOURCE_GROUNDING.md), [MEDIA_PIPELINE.md](MEDIA_PIPELINE.md),
[ENVIRONMENT.md](ENVIRONMENT.md), [TESTING.md](TESTING.md), [DEPLOYMENT.md](DEPLOYMENT.md),
[API_LIMITATIONS.md](API_LIMITATIONS.md).

---

## A. Product architecture

### A.1 The one idea

Every sermon is a **Sermon Notebook**: a container of *evidence* (the sermon recording, the
user's notes, photos, documents, captured moments) from which the app derives one canonical,
versioned, source-grounded **Sermon Pack**. Every downstream feature — overview, timeline,
Ask AI, Bible study, review, and later flashcards/quiz/audio/video — reads the Pack plus the
original evidence. Nothing downstream re-interprets the raw sermon on its own.

```
          EVIDENCE (user-owned, durable)                 DERIVED (regenerable, versioned)
 ┌──────────────────────────────────────────┐      ┌─────────────────────────────────────┐
 │ YouTube URL (public) ─┐                  │      │ per-source analyses (cached by hash)│
 │ Uploaded audio/video ─┼─ sermon_sources ─┼────▶ │ Sermon Pack vN  (ai_artifacts)       │
 │ Notes (rich text)    ─┤  (provenance     │      │  ├ normalized items (main_ideas,     │
 │ Photos (+OCR)        ─┤   registry)      │      │  │  sections, moments, scripture,    │
 │ Documents (PDF/text) ─┤                  │      │  │  quotes, applications, review…)   │
 │ Captures (bookmark,  ─┘                  │      │  └ source_citations (item → evidence)│
 │  question, important)                    │      │ source_chunks + embeddings (RAG)     │
 └──────────────────────────────────────────┘      │ study guides, chat answers           │
                                                    └─────────────────────────────────────┘
```

### A.2 System components

```
 Browser (mobile-first PWA-style web app)
  ├─ React UI (Next.js App Router; RSC for reads, client islands for editor/player)
  ├─ Player context (YouTube IFrame API / HTML5 media) → seek, current time
  ├─ Offline outbox (IndexedDB): note saves, captures, queued photos
  └─ Direct-to-storage uploads (signed upload URL / TUS resumable)
        │ HTTPS (cookies: Supabase session)                    │ uploads
        ▼                                                      ▼
 Next.js server (Vercel or any Node host)                Supabase Storage (private buckets)
  ├─ proxy.ts: session refresh, auth gate, CSP nonce          ▲
  ├─ Route Handlers /api/*: Zod-validated JSON API            │ service role (server only)
  │    user-scoped Supabase client → RLS enforced             │
  ├─ Domain services (lib/*): sermons, sources, notes,        │
  │    scripture, pack, retrieval, study, review              │
  └─ Job enqueue (privileged, server-only)                    │
        │                                                     │
        ▼                                                     │
 Postgres (Supabase) ── RLS on every user table ──────────────┤
  ├─ domain tables, provenance, citations                     │
  ├─ jobs (durable queue: lease + retry + backoff)            │
  └─ pgvector + full-text (hybrid retrieval)                  │
        ▲                                                     │
        │ claim (FOR UPDATE SKIP LOCKED), heartbeat, complete │
 Worker (Node process `npm run worker`, or cron-invoked route)│
  ├─ Job handlers: ingest, analyze media, photos, documents,  │
  │    scripture, build pack, embeddings, study               │
  ├─ AI layer (lib/ai): task functions → prompt registry →    │
  │    provider adapter (Gemini) → Zod validation/repair      │
  └─ Media utils (sharp previews, MIME sniffing) ─────────────┘
        │
        ▼
 AI providers: Gemini API (default) · others via adapter [OPT]
 Metadata: YouTube Data API v3 [OPT] · oEmbed (best-effort) · Bible text provider [OPT]
```

### A.3 Layering rules (enforced by folder structure and review)

1. **UI never contains business logic.** Components call `features/*` hooks/actions, which call
   `/api/*` or server functions in `lib/*`.
2. **Vendor code is confined.** Only `lib/ai/providers/<vendor>` imports a vendor AI SDK. Only
   `lib/youtube/*` knows YouTube response shapes. Only `lib/bible/providers/*` know Bible APIs.
3. **Two database access paths, deliberately:**
   - *User path* — Supabase client carrying the user's JWT; Postgres RLS enforces tenant
     isolation. All request handlers use this path for user data.
   - *Privileged path* — `lib/db/admin.ts` (service credentials, `server-only`). Used by the
     worker and by a small, audited set of server functions (enqueue, upload verification,
     account deletion). It always filters by an explicit `user_id` it derived from an
     authorized request or from the job row.
4. **All AI output is untrusted input** until validated by Zod and resolved against the source
   catalog (see D).
5. **User-authored content is authoritative.** Generated content never overwrites a row marked
   `user_edited`, a user OCR version, or a corrected timestamp.

### A.4 Fallback-first map (§71)

| Capability | Primary | Fallback chain |
|---|---|---|
| Understand the sermon | Gemini on public YouTube URL | → uploaded authorized recording (Files API) → notes + photos + documents only |
| Video metadata | YouTube Data API v3 (if key) | → oEmbed (best-effort) → user-typed metadata |
| Photo text | Gemini image understanding | → original image only, user types/edits text |
| AI provider | Gemini | → another configured provider (adapter slot; none configured by default) → app keeps working without AI (notes, photos, library, full-text search) |
| Retrieval | Hybrid vector + full-text | → full-text only (no embeddings needed) |
| Scripture text | Configured licensed/public-domain provider | → reference only, never invented text |
| Audio recap [P3] | Internal pipeline (script → validation → TTS) | Gemini Notebook audio adapter [OPT] |
| Video recap [P4] | Deterministic renderer (Remotion) | generative visuals [OPT] never required |

---

## B. Tech stack

Versions verified against the npm registry on 2026-09-28.

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.3** (App Router), **React 19.3** | Server Components for fast, private reads; Route Handlers for a typed JSON API that offline clients can replay; `proxy.ts` (Next 16's replacement for `middleware.ts`, Node runtime) for session refresh + CSP nonces. |
| Language | **TypeScript 6.0**, `strict`, `noUncheckedIndexedAccess` | TS 7 (native compiler) is out, but `typescript-eslint` supports `<6.1`; 6.0 keeps lint + Next build compatible. |
| Styling | **Tailwind CSS 4.3** + CSS custom-property tokens | Tokens carry light/dark/Sunday themes; utility classes keep components small. |
| Primitives | **radix-ui 1.6** (Dialog, Popover, DropdownMenu, VisuallyHidden) | Accessible focus management, no hover dependence. |
| Rich text | **Tiptap 3.31** (ProseMirror) + UniqueID | Headings, lists, tasks, quote, highlight, custom Scripture/timestamp nodes; stable block IDs make note blocks citable. |
| Validation | **Zod 4.6** | API inputs, env, and every AI response. |
| Database | **Postgres 17 (Supabase)** + **pgvector** + `pg_trgm` + FTS | Relational integrity, RLS, hybrid retrieval in one store. |
| Auth | **Supabase Auth** (email+password, magic link) via `@supabase/ssr 0.12` | Trusted provider; no custom crypto. Google/Apple later. |
| Storage | **Supabase Storage** (private buckets, signed upload URLs, TUS resumable) | Per-user path RLS, bucket MIME/size limits. |
| Privileged DB | **postgres.js 3.4** | Transactions and `FOR UPDATE SKIP LOCKED` for the queue. |
| Jobs | **Postgres-backed queue** (own `jobs` table) + Node worker | Durable, observable, testable locally; no extra vendor. Worker runs as a process or via cron-invoked route. |
| AI | **@google/genai 2.24** behind `lib/ai` interfaces | Gemini is the only verified provider for public-YouTube video understanding. Models are env-configurable. |
| Embeddings | `gemini-embedding-001` @ 768 dims (normalized) | GA; 768 keeps HNSW indexes small. |
| Scripture parsing | **bible-passage-reference-parser 4.0** (MIT) + own spoken-number/allusion layer | Mature parser with versification validation. |
| Images | **sharp 0.35** | EXIF-orientation, metadata-stripped previews and analysis renditions. |
| Uploads | **tus-js-client 4.3** | Resumable media uploads on flaky church Wi-Fi. |
| Offline | **idb 8** | IndexedDB outbox for notes/captures/photos. |
| Fonts | Self-hosted via `@fontsource-variable` (Literata, Atkinson Hyperlegible Next) | No build-time network dependency; see DESIGN notes. |
| Tests | **Vitest 5**, **Playwright 1.63** | Unit/integration against a real local Supabase; E2E through the production build. |
| Local infra | **Supabase CLI 2.118** (Docker) | Real Auth/Storage/Postgres/RLS locally. |
| Hosting | Vercel (web) + worker on any Node host, or Vercel Cron → `/api/internal/jobs/run` | See DEPLOYMENT.md. |
| Video recap [P4] | Remotion (deterministic) | Not installed until Phase 4. |

---

## C. Database schema

Full DDL lives in `supabase/migrations/`. Details, indexes, and policies: [DATABASE.md](DATABASE.md).

### C.1 Entities and relationships

```
auth.users 1─1 profiles
auth.users 1─1 user_settings
auth.users 1─* sermons
sermons 1─* sermon_sources            (provenance registry; one row per evidence source)
  sermon_sources 1─1 video_sources    (YouTube or uploaded video)
  sermon_sources 1─1 audio_sources    (uploaded audio)
  sermon_sources 1─1 photos           (1─* ocr_extractions, versioned; user versions win)
  sermon_sources 1─1 documents
  sermon_sources 1─1 notes            (1─* note_blocks, derived on save)
sermons 1─* media_files               (every stored object: originals, previews)
sermons 1─* ai_artifacts              (analyses, SERMON_PACK vN, BIBLE_STUDY, …)
sermons 1─* main_ideas | sermon_sections | sermon_moments | scripture_references |
            quotes | illustrations | applications | questions | terms | review_items
            (normalized Pack items; each has origin ai|user, user_edited, pack_artifact_id)
sermons 1─* source_citations          (subject item → evidence source + locator)
sermons 1─* source_chunks             (retrieval units + embedding vector(768) + tsvector)
sermons 1─* study_guides
sermons 1─* chat_threads 1─* chat_messages
jobs *─1 sermons (nullable)           (durable queue + processing stages)
rate_limits                           (per-user fixed windows)
```

Phase 2+ tables (`flashcards`, `quizzes`, `quiz_attempts`, `media_generations`, `topics`,
`sermon_topics`) are specified in DATABASE.md and arrive with their features so the schema
never contains unused, untested tables.

### C.2 Key design rules

- Every user-owned row carries `user_id` (denormalized) so RLS policies are a single indexed
  equality, plus a composite check that `sermon_id` belongs to the same user on insert/update.
- Normalized tables for anything searched, filtered, cited, corrected, or counted. JSON only
  for flexible generated payloads (`ai_artifacts.structured_content`, study-guide sections,
  OCR block lists) and ProseMirror note documents.
- Pack versioning: `ai_artifacts(type='SERMON_PACK', version, source_version_hash, provider,
  model, prompt_version)`; `sermons.current_pack_id` points at the live version; prior versions
  are retained (status `superseded`) for debugging and diffing.
- Corrections: `user_edited boolean`, `sermons.corrected_fields text[]`,
  `sermon_moments.verification_status`, and `ocr_extractions(origin='user', is_current)`.
- Hashes: `sermon_sources.content_hash`, `note_blocks.content_hash`, `source_chunks.content_hash`,
  `ai_artifacts.input_hash` drive caching and invalidation (§69).

### C.3 Indexes (highlights)

`(user_id, updated_at desc)` on sermons; `(sermon_id)` on every child; GIN on tsvector columns;
`gin_trgm_ops` on sermon title/speaker/church/series; HNSW `vector_cosine_ops` on
`source_chunks.embedding`; partial unique index on `jobs(dedupe_key) where status in
('queued','running')`; `(status, run_after)` partial index for claiming.

### C.4 RLS approach

- RLS **enabled on every table** in `public`; `anon` has no table privileges.
- Owner policies: `user_id = (select auth.uid())` (the `select` wrapper lets Postgres cache
  the value per statement).
- Child inserts/updates additionally require the parent sermon to be owned by the caller.
- System-written tables (`jobs`, `ai_artifacts`, `source_chunks`, `source_citations`) are
  **read-only** to users; only the privileged worker writes them.
- Column privileges restrict which Pack-item columns a user may update (e.g. timestamps,
  text, hidden) so provenance columns (`origin`, `provider`, `pack_artifact_id`) can't be forged.
- Storage: private buckets; object policies require `(storage.foldername(name))[1] = auth.uid()::text`.
- Automated tests assert that user B can neither read nor mutate user A's rows or objects.

---

## D. Source model (provenance & citations)

Details: [SOURCE_GROUNDING.md](SOURCE_GROUNDING.md).

### D.1 Sources

`sermon_sources` is the provenance registry. `source_type ∈ {SERMON_VIDEO, UPLOADED_VIDEO,
UPLOADED_AUDIO, USER_NOTE, PHOTO, OCR_EXTRACTION, DOCUMENT, BIBLE_SOURCE, AI_GENERATED,
EXTERNAL_REFERENCE}`. Each row has a human label ("Photo 3", "Your notes", "Sermon video"),
an ordinal, a status, and a `content_hash`.

UI voice mapping (never merged, never color-only — each has an icon + text label):

| UI label | Source types |
|---|---|
| **YOU** | USER_NOTE, user captures, user OCR corrections, user answers |
| **SERMON** | SERMON_VIDEO, UPLOADED_VIDEO, UPLOADED_AUDIO (always with `~mm:ss` when timed) |
| **PHOTO** | PHOTO, OCR_EXTRACTION |
| **DOC** | DOCUMENT |
| **SCRIPTURE** | BIBLE_SOURCE (reference; verse text only from a licensed provider) |
| **AI** | AI_GENERATED synthesis (summaries, ideas, study text) |

### D.2 Evidence units and source keys

Before any synthesis, the worker builds a **source catalog**: every citable evidence unit gets
a short key the model can reference, e.g.

- `V7` → sermon segment 7 of the media analysis (source id, `~18:42–20:10`, confidence)
- `N3` → note block (note source id, block id, optional user timestamp)
- `P2` → photo 2 (photo source id, current OCR version)
- `C4` → capture (bookmark/question/important, exact user timestamp)
- `D1.p3` → document 1, page 3

The model may only cite keys. The **citation resolver** maps keys → `source_citations` rows
(`source_id`, `note_block_id`, `timestamp_start/end`, `page`, `excerpt`, `confidence`).
Unknown keys are **dropped and counted** (`citation_drop_count` in the artifact meta) — a fake
citation can never reach the UI. Timestamps on generated items are derived from the cited
`V*` segments (clamped to media duration); model-stated times that disagree with the cited
segments are replaced and the confidence lowered.

### D.3 Trust rules encoded in the model

- **Quotes**: `quote_type ∈ {VERBATIM_QUOTE, PARAPHRASE}`. A quote is VERBATIM only with
  evidence (exact match in a user note/OCR, or a segment the analysis marked as heard verbatim
  with high confidence). Otherwise it is stored and shown as a paraphrase, without quote marks.
- **Timestamps**: `timestamp_start/end`, `timestamp_confidence (high|medium|low)`,
  `timestamp_source (ai|user_capture|user_correction)`, `verification_status
  (unverified|user_verified|user_corrected)`. AI times render as `~28:15`. User-corrected times
  are never overwritten.
- **Scripture**: `kind ∈ {explicit, spoken, inferred, allusion}` + confidence; verse text is
  shown only from a Bible provider; otherwise the normalized reference alone.
- **OCR**: original image is evidence; OCR is derived and versioned; unreadable spans are
  marked `[unclear]`, never invented.

---

## E. AI pipeline

Details: [AI_PIPELINE.md](AI_PIPELINE.md).

```
Sources ──────────────────────────────────────────────────────────────────────────────
 YouTube URL │ Uploaded media │ Notes │ Photos │ Documents │ Captures
      │             │            │        │          │           │
      ▼             ▼            │        ▼          ▼           │
Ingestion ─────────────────────────────────────────────────────────────────────────────
 INGEST_SERMON (metadata, eligibility) · upload verification (MIME sniff, size, hash)
      │             │            │        │          │           │
      ▼             ▼            ▼        ▼          ▼           ▼
Extraction (per source, cached by content_hash + prompt_version) ────────────────────────
 ANALYZE_VIDEO / ANALYZE_AUDIO → timestamped segments, metadata guesses, scripture mentions,
                                 notable phrases (verbatim flag), illustrations
 note_blocks (deterministic)   PROCESS_PHOTO → OCR blocks + confidence + scripture
 PROCESS_DOCUMENT → pages      EXTRACT_SCRIPTURE (deterministic parser + normalization)
      │
      ▼
Structured Analysis ─────────────────────────────────────────────────────────────────────
 Source catalog (keys) → BUILD_SERMON_PACK prompt → Zod validate → repair/retry
 → citation resolver → quote verifier → timestamp reconciler → user-edit preservation
      │
      ▼
Sermon Pack vN (ai_artifacts + normalized items + source_citations) ─────────────────────
      │
      ▼
Embeddings ──────────────────────────────────────────────────────────────────────────────
 CREATE_EMBEDDINGS: chunk sources + pack items → embed only changed chunks → pgvector
      │
      ▼
AI Features ─────────────────────────────────────────────────────────────────────────────
 Overview/timeline (pure reads) · Ask AI (classify → hybrid retrieve → answer → cite)
 · GENERATE_STUDY · review items · [P2] flashcards/quiz/tutor · [P3] audio · [P4] video
```

Model tiers (env-configurable; defaults verified 2026-09-28):

| Tier | Default model | Used for |
|---|---|---|
| `media` | `gemini-3.8-flash` | video/audio/image/document understanding |
| `synthesis` | `gemini-3.8-flash` (set `gemini-3.1-pro-preview` for more depth) | Sermon Pack, Ask AI answers, Bible study |
| `fast` | `gemini-3.1-flash-lite` | question classification, small extractions |
| `embedding` | `gemini-embedding-001` (768d) | retrieval |

Every call records provider, model, prompt version, token usage, latency, and estimated cost.

---

## F. Job architecture

- **Queue**: `jobs` table. A job has `type`, `status (queued|running|succeeded|failed|cancelled)`,
  `stage` (human label), `progress (0–100)`, `payload`, `result`, `attempt_count`,
  `max_attempts`, `run_after`, `locked_by`, `locked_until`, `last_error`, `error_code`,
  `started_at`, `completed_at`, `provider`, `model`, `prompt_version`, `usage`, `dedupe_key`.
- **Claiming**: `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n)` sets a lease
  (`locked_until`). Long handlers heartbeat to extend the lease. A crashed worker's jobs are
  reclaimed when the lease expires.
- **Retries**: transient errors (network, 429, 5xx, invalid JSON after repair) retry with
  exponential backoff + jitter (30s, 2m, 8m). Permanent errors (private video, unsupported file,
  auth) fail immediately with a user-safe `error_code`.
- **Never stuck**: a sweeper fails jobs whose leases expired after the last attempt; the
  sermon's processing view is *computed* from its jobs, so it cannot show "processing" once
  every job is terminal. Every failure state offers a next action (retry / upload recording /
  continue with notes).
- **Dependencies**: source jobs (`INGEST_SERMON`, `ANALYZE_*`, `PROCESS_PHOTO`,
  `PROCESS_DOCUMENT`) call `maybeScheduleSynthesis(sermon)` when they finish. Once the sermon is
  finished and no source job is pending, it enqueues `EXTRACT_SCRIPTURE`
  (`dedupe_key = scripture:<sermon>`), which enqueues `BUILD_SERMON_PACK`
  (`dedupe_key = pack:<sermon>`). The pack job skips itself when the catalog's
  `source_version_hash` (sources + prompt version) matches the current pack, and otherwise
  enqueues `CREATE_EMBEDDINGS`. Post-finish edits schedule a debounced rebuild (`run_after`:
  notes +3 min, photo transcription corrections +2 min, source removal +1 min), and edits that
  land while a pack is building trigger one more rebuild a minute later.
- **Stages → UI**: Preparing sermon (INGEST_SERMON) · Understanding sermon (ANALYZE_*) · Reading
  photos (PROCESS_PHOTO) · Reading documents · Identifying Scripture (EXTRACT_SCRIPTURE) ·
  Connecting sources / Building Sermon Pack (BUILD_SERMON_PACK, with sub-stages) · Preparing AI
  search (CREATE_EMBEDDINGS) · Ready. Each row is a real job; sub-stage text is written by the
  handler as it progresses.
- **Runners**: `npm run worker` (long-running, N concurrent), and `POST /api/internal/jobs/run`
  (bearer `CRON_SECRET`) that drains jobs until its time budget ends — for serverless hosts.
  Enqueue from a request also schedules an immediate drain via `after()`.
- **Idempotency**: handlers are written to be re-runnable (upserts keyed by source/version;
  artifacts keyed by `input_hash`).

---

## G. Routes

### G.1 Pages (App Router)

| Route | Purpose | Phase |
|---|---|---|
| `/` | Signed-out welcome; signed-in → `/home` | MVP |
| `/sign-in`, `/sign-up`, `/auth/confirm`, `/auth/callback`, `/auth/error` | Auth | MVP |
| `/home` | Greeting, New Sermon, Continue studying, This week, Recent sermons, Questions | MVP |
| `/library` | Search + filters (speaker, church, series, book, date) | MVP |
| `/sermons/new` | Choose: YouTube · Take photo · Upload media · Upload document · Start notes | MVP |
| `/sermons/[id]` | Notebook **Overview** (Big Idea, Main Ideas, Timeline, Scripture, Notes, Photos, This Week) | MVP |
| `/sermons/[id]/notes` | Note editor + captures | MVP |
| `/sermons/[id]/sermon` | Player, timeline, outline, quotes, illustrations | MVP |
| `/sermons/[id]/study` | Bible study generator + guides, review items | MVP |
| `/sermons/[id]/ask` | Ask AI thread | MVP |
| `/sermons/[id]/scripture` · `/photos` · `/sources` | Secondary views (under “More”) | MVP |
| `/sermons/[id]/sunday` | Sunday Mode (minimal capture) | MVP |
| `/study` | Cross-sermon review queue and saved studies | MVP (review) / P2 (tutor) |
| `/questions` | Questions inbox | P2 (MVP shows per-sermon) |
| `/profile` | Settings, privacy & AI disclosure, export, delete account | MVP |

Mobile navigation: bottom bar with **Home · Library · Study · Profile**; inside a notebook a
segmented bar **Overview · Notes · Sermon · Study · More** (More opens a sheet: Scripture, Ask
AI, Photos, Sources, Sunday Mode, Edit details, Delete).

### G.2 API (Route Handlers, JSON, Zod-validated, user-scoped)

| Method & path | Purpose |
|---|---|
| `POST /api/sermons` | Create sermon (optional YouTube URL, metadata) |
| `GET/PATCH/DELETE /api/sermons/:id` | Read, correct metadata (marks `corrected_fields`), delete (storage + rows) |
| `POST /api/sermons/:id/youtube` | Attach/replace YouTube URL → INGEST_SERMON (+ ANALYZE_VIDEO when eligible) |
| `POST /api/sermons/:id/finish` | Finish Sermon → schedule remaining jobs + pack |
| `POST /api/sermons/:id/rebuild` | Regenerate pack (keeps user edits) |
| `GET /api/sermons/:id/status` | Stages + progressive data version (polled while processing) |
| `POST /api/sermons/:id/notes` · `PUT /api/notes/:id` | Create / save note (optimistic `baseVersion`; 409 on conflict) |
| `POST /api/sermons/:id/captures` | Bookmark / question / important (idempotent client UUID) |
| `PATCH /api/moments/:id` · `PATCH /api/scripture/:id` · `PATCH /api/pack-items/:type/:id` | User corrections |
| `POST /api/uploads` · `POST /api/uploads/:id/complete` | Request signed upload → verify (MIME sniff, size) → enqueue |
| `PATCH /api/photos/:id/ocr` · `POST /api/photos/:id/retry` · `DELETE /api/sources/:id` | OCR correction, retry, delete evidence |
| `GET /api/media/:sourceId/url` | Short-lived signed URL for private playback/preview |
| `POST /api/sermons/:id/ask` | Ask AI (NDJSON stream of stages + final answer with citations) |
| `POST /api/sermons/:id/studies` · `GET /api/studies/:id` | Generate / read Bible study |
| `PATCH /api/review-items/:id` · `PATCH /api/applications/:id` · `PATCH /api/questions/:id` | Review & action states |
| `GET /api/library/search` | Cross-library search |
| `GET /api/account/export` · `DELETE /api/account` | Data export, account deletion |
| `GET /api/integrations/status` | Integration status registry (AVAILABLE/PREVIEW/UNAVAILABLE/…) |
| `POST /api/internal/jobs/run` | Worker drain (bearer `CRON_SECRET`; not user-callable) |

---

## H. UX flows

### H.1 New sermon
Home → **New Sermon** → sheet with five paths. *YouTube*: paste → instant client validation
(ID extraction) → create → notebook opens immediately with embed, thumbnail/title/channel as
they arrive → analysis starts in the background (unless the video is live/upcoming/private).
*Photo*: camera/library/file → sermon created → photos upload with progress → OCR begins.
*Upload media*: rights confirmation checkbox → resumable upload → analysis. *Document*: PDF/text.
*Start notes*: straight into the editor. All paths land in the same notebook; more sources can
be added any time.

### H.2 Sunday Mode
Notebook → More → Sunday Mode (or “Start notes” from home on a Sunday). Dim, low-luminance
theme; title; large note area; bottom row of 64px buttons: **Photo · Scripture · Bookmark ·
Question · Important**. No AI popups. Every action writes to IndexedDB first and syncs when
online; a quiet status line shows “Saved on this device” vs “Synced”. Captures record wall-clock
time and, if a player is active, the playback time.

### H.3 After-sermon processing
**Finish Sermon** → confirmation of what will be analyzed (and by which provider — privacy
disclosure) → staged progress list (each line a real job, with retry on failure) → the Overview
fills progressively: metadata → preliminary summary/timeline from the media analysis → Pack
(Big Idea, Main Ideas, Scripture, quotes…) → “Ask AI ready”. Notes stay editable throughout.

### H.4 Study
Notebook → Study → **Create Bible Study** → format (5-min, 15-min, 30-min, Deep, Small group,
Youth, Personal, Family) → job progress → guide with sections, each section showing its sources;
“Scripture text unavailable — reference only” when no Bible provider is configured.

### H.5 Ask AI
Notebook → Ask (or the ask field on Overview) → question → streamed stages (“Searching your
sermon · Writing answer”) → answer with inline citation chips; tapping `~31:42` seeks the player;
tapping “Your note ¶6” opens the note at that block; low-confidence answers say so and separate
general background from what this sermon says.

### H.6 Review
Overview “This week” and `/study` list review items (Things to remember, Scriptures, Questions,
Applications, Potentially confusing). Actions: Reviewed · Save · Review again · Hide. No streaks,
no scores.

### H.7 Audio [P3]
Study → **Create audio recap** → style/length/focus → internal pipeline job (outline → script
→ validation against the Pack → TTS → captions) → player with transcript and AI-generated label.
Gemini Notebook audio appears only when its adapter reports AVAILABLE/PREVIEW; failures fall
back to the internal pipeline automatically.

---

## I. Third-party dependencies

| Service | What it does | Required? | Fallback | Maturity (verified 2026-09-28) |
|---|---|---|---|---|
| Supabase (Postgres, Auth, Storage) | Data, auth, files | **Required** (self-hostable) | Self-host Supabase; schema is plain Postgres | GA |
| Gemini API (`@google/genai`) | Media/image/doc understanding, synthesis, embeddings | Required **for AI features only** | App works without AI; adapter slot for another provider | generateContent GA (Google now labels it “legacy”, still supported; Interactions API is the new primary) |
| Gemini YouTube URL input | Analyze public YouTube videos | Optional path | Upload recording → notes/photos | **Preview**; public videos only; daily limits apply |
| Gemini Files API | Uploaded media ≤2 GB, 48 h retention | Optional path | Notes/photos only | GA |
| YouTube IFrame Player API | Official embed, seek, current time | Required for YouTube playback | Link out to YouTube | GA |
| YouTube Data API v3 | Title, channel, duration, privacy, live status | Optional (`YOUTUBE_API_KEY`) | oEmbed (best-effort, not formally documented) → user types metadata | GA |
| Bible text provider (API.Bible, etc.) | Verse text | Optional | Reference only | GA; licensing per translation |
| TTS provider [P3] | Audio recap voices | Optional | Script/transcript only | Gemini TTS is Preview |
| Gemini Notebook Enterprise API [P3, OPT] | Audio Overview | Never required | Internal audio pipeline | **Pre-GA Preview**, enterprise-only |
| Standalone Podcast API | — | **Not used** | Internal pipeline | Deprecated; no new allowlisting |
| Meta Muse | — | **Not used** | n/a | No API for notebook/podcast/video import; Meta Model API (Muse Spark) is a general LLM API in preview — could be an alternate text provider later |
| Vercel | Hosting, cron | Optional | Any Node host + worker process | GA |

---

## J. Cost model

Estimates for one 45-minute sermon at Gemini 3.8 Flash list prices ($1.50 / 1M input,
$7.50 / 1M output from 2027-01-01; introductory $0.75 / $3.75 until 2026-12-31). Token rates
from Gemini docs at time of writing (~32 tok/s audio; per-frame video tokens depend on
`mediaResolution`). YouTube URL input is currently a free Preview; figures assume it is billed.

| Step | Tokens (approx.) | Cost @ 2027 list |
|---|---|---|
| Video analysis, `MEDIA_RESOLUTION_LOW`, 0.5 fps (2700 s) | ~180k in, ~10k out | ~$0.35 |
| Audio-only upload analysis (32 tok/s) | ~90k in, ~10k out | ~$0.21 |
| 6 photos OCR | ~8k in, ~4k out | ~$0.04 |
| Sermon Pack synthesis | ~25k in, ~8k out | ~$0.10 |
| Embeddings (~120 chunks) | ~25k | <$0.01 |
| Ask AI (per question) | ~10k in, ~0.8k out | ~$0.02 |
| Bible study (per guide) | ~15k in, ~4k out | ~$0.05 |

**≈ $0.45–0.60 per fully processed video sermon**, most of it the one-time media analysis.

Optimizations built in: analyze media **once** (cached by `content_hash + prompt_version`);
low media resolution + reduced fps for talking-head sermons; synthesis re-runs over cached
text analyses, never over the video; embeddings only for changed chunks; `fast` tier for
classification; per-user rate limits; debounced post-finish rebuilds; usage and estimated cost
recorded per job for monitoring.

---

## K. Security plan

- **Auth**: Supabase Auth (password + magic link), PKCE/token-hash confirmation routes,
  session refresh in `proxy.ts`, `getClaims()` verification server-side. No custom crypto.
- **Authorization**: every route calls `requireUser()`; user data is read/written through the
  user-scoped client so **RLS is the enforcement layer**, with ownership also checked explicitly
  before privileged actions (enqueue, upload verification, deletion).
- **RLS**: enabled on all tables, owner-only policies, parent-ownership checks, read-only system
  tables, column-level update grants. Tested with two real users.
- **Uploads**: server-issued signed upload URLs to server-chosen paths
  (`<user>/<sermon>/<file>`); bucket-level MIME allowlists and size caps; post-upload magic-byte
  sniffing (`file-type`) and size verification before any processing; rights confirmation
  recorded for audio/video; originals kept private; previews stripped of EXIF (GPS).
- **Secrets**: `GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `CRON_SECRET`,
  `YOUTUBE_API_KEY`, Bible keys are server-only (validated by a Zod env schema; the env module,
  admin clients, and AI provider modules import `server-only`, so a client import fails the
  build). Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key reach the browser.
- **Tenant isolation**: RLS + storage path policies + worker always scoping by job `user_id`.
- **Rate limiting**: Postgres fixed-window counters per user and action (ask, study, finish,
  uploads, YouTube attach).
- **Headers**: nonce-based CSP (YouTube frames/scripts allowlisted), `frame-ancestors 'none'`,
  HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera only self).
- **AI data exposure**: content leaves our infrastructure only to the configured AI provider,
  only on user actions (attach, upload, finish, ask, generate). The Profile page and the Finish
  dialog disclose which provider receives which content. Paid-tier Gemini API terms: prompts
  are not used to train models (free tier differs — documented in API_LIMITATIONS.md). No
  private content is used for training by us; logs never contain note/OCR/answer text.
- **Privacy controls**: delete sermon, photo, source, generated study, account; JSON export.

---

## L. MVP plan (milestones)

Each milestone ends with the quality gate (§99): lint · typecheck · unit · integration ·
production build · main-flow verification.

| # | Milestone | Deliverables |
|---|---|---|
| M0 | Architecture | This document + companion docs, API verification |
| M1 | Foundation | Next.js scaffold, tokens/theme, env schema, local Supabase, migrations, RLS + RLS tests |
| M2 | Auth + shell | Sign-in/up/magic link, proxy session refresh, CSP, app shell, bottom nav |
| M3 | Sermons + notes | Create sermon, library, notebook shell, Tiptap editor w/ autosave + offline outbox + conflict copy, captures |
| M4 | YouTube | URL parsing, metadata (Data API / oEmbed), official embed with seek + current time, timestamped notes |
| M5 | Jobs + AI core | Queue, worker, provider abstraction, Gemini adapter, prompts, schema validation, fixture provider for tests |
| M6 | Evidence processing | Public-video analysis, uploaded-media fallback, photo pipeline (previews, OCR, corrections), documents, Scripture engine |
| M7 | Sermon Pack | Source catalog, synthesis, citation resolver, quote/timestamp rules, persistence with user-edit preservation, Overview UI, processing stages |
| M8 | Retrieval + Ask AI | Chunking, embeddings, hybrid search, Ask AI with citations and seek |
| M9 | Study + Review | Bible study generation (formats), review items + actions, This week |
| M10 | Mobile + Sunday Mode + hardening | Sunday Mode, safe areas, keyboard, a11y pass, rate limits, export/delete, error states |
| M11 | Tests + evals | Integration + E2E main flow, evaluation harness + fixtures |

Phase 2 (flashcards, quiz, Review With Me, weekly review, devotionals, questions inbox, topics,
series, cross-sermon AI) begins only after M11 is green.
