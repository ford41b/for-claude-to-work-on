# Database

Postgres 17 on Supabase. The schema is plain SQL in `supabase/migrations/` and uses only
standard extensions (`vector`, `pg_trgm`, both in the `extensions` schema), so it runs on hosted or self-hosted
Supabase. The high-level entity map is in [ARCHITECTURE.md §C](ARCHITECTURE.md#c-database-schema).
This document covers the details.

## Migrations

| File | Contents |
|---|---|
| `20260928000100_foundation.sql` | Extensions, enums, `set_updated_at()`, `profiles`, `user_settings`, the `handle_new_user` trigger |
| `20260928000200_sermons_sources.sql` | `sermons`, `owns_sermon()`, `sermon_sources` and the per-type source tables, `media_files`, `ocr_extractions`, `notes`, `note_blocks`, `create_note()`, `save_note()` |
| `20260928000300_pack.sql` | `ai_artifacts`, the Sermon Pack item tables, `source_citations` |
| `20260928000400_retrieval_chat_study.sql` | `source_chunks` (vector + tsvector), `chat_threads`, `chat_messages`, `study_guides`, `match_source_chunks()`, `search_library()` |
| `20260928000500_jobs_limits_storage.sql` | `jobs`, `rate_limits`, `consume_rate_limit()`, storage buckets and object policies |

Workflow:

```bash
npm run db:start      # local Supabase (Docker)
npm run db:reset      # drop, re-apply every migration, re-seed
npm run db:types      # regenerate types/database.ts from the live schema
```

New changes always go in a **new** migration file. Never edit an applied migration. After any
schema change, regenerate `types/database.ts` and commit it together with the migration.

## Tables

### Identity and settings

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | Display name | Created by the `handle_new_user` trigger on `auth.users` insert |
| `user_settings` | Theme, text size, preferred Bible translation, AI-processing acknowledgement, weekly review opt-in | One row per user; also created by the trigger |

### Sermons and sources

| Table | Purpose | Notes |
|---|---|---|
| `sermons` | One notebook per sermon | `status` is `draft` or `finished` only. Processing state is **computed from `jobs`**, never stored. `corrected_fields text[]` lists metadata the user set; AI suggestions never overwrite those fields (they go to `metadata_suggestions`). The denormalized `big_idea` and summaries come from the current pack. `pack_stale` is set when evidence changes after a build. `search_tsv` feeds library search. |
| `sermon_sources` | Provenance registry, one row per evidence source | `source_type` ∈ `SERMON_VIDEO`, `UPLOADED_VIDEO`, `UPLOADED_AUDIO`, `USER_NOTE`, `PHOTO`, `DOCUMENT`, … `ordinal` is the per-type number shown to users ("Photo 2"); unique per `(sermon_id, source_type, ordinal)`. `status` ∈ `pending_upload`, `ready`, `processing`, `processed`, `failed`, `unavailable`, plus `error_code` and a user-safe `error_message`. `content_hash` drives caching. |
| `video_sources` | YouTube or uploaded video | YouTube id, canonical URL, official metadata (title, channel, duration, privacy, embeddable, live status), `metadata_provider` |
| `audio_sources` | Uploaded audio | Duration, `media_file_id` |
| `media_files` | Every stored object (originals and previews) | Bucket, path, MIME type, size, `sha256`, and `status` (`pending` → `uploaded` → `verified`/`rejected`). A check constraint requires `rights_confirmed_at` for audio and video. |
| `photos` | Photo evidence | `current_ocr_id`, preview file, dimensions, optional `sermon_timestamp_seconds` |
| `ocr_extractions` | Versioned photo transcriptions | `origin` is `ai` or `user`; a partial unique index keeps exactly one `is_current` row per photo. A user correction becomes a new current version, and later AI runs never replace it. |
| `documents` | PDFs and text files | Extracted `pages jsonb` (`[{page, text}]`) |
| `notes` | The listener's notes (ProseMirror JSON) | `version` for optimistic concurrency, `content_hash`, and `plain_text` for search |
| `note_blocks` | Derived per-block rows | Written by `save_note()` on every save. Stable `block_id`s (from the editor's UniqueID extension) let citations deep-link to `#block-<id>`. |

### Sermon Pack

| Table | Purpose |
|---|---|
| `ai_artifacts` | Every AI output: media analyses, `SERMON_PACK` versions, studies. Records `input_hash`, `provider`, `model`, `prompt_version`, token usage, estimated cost, and `status` (`building`, `ready`, `failed`, `superseded`). Pack versions are unique per sermon; `sermons.current_pack_id` points at the live one. |
| `main_ideas`, `sermon_sections`, `sermon_moments`, `scripture_references`, `quotes`, `illustrations`, `applications`, `questions`, `terms`, `review_items` | Normalized Pack items. Each has `origin` (`ai`/`user`), `user_edited`, `hidden`, `position`, and `pack_artifact_id`. |
| `source_citations` | Polymorphic link from a subject (`subject_type` ∈ sermon, main_idea, section, moment, scripture, quote, illustration, application, question, term, review_item, chat_message, study_guide, with `subject_id` and an optional `subject_part` such as a summary field or study section) to a `sermon_sources` row, plus the locator: `source_key`, `note_block_id`, `timestamp_start/end`, `page`, `excerpt`, and `confidence`. |

Item-specific rules enforced in SQL:

- **`quotes`**: a check constraint allows an AI-origin `VERBATIM_QUOTE` only with non-null `verbatim_evidence` (`heard_verbatim`, `matched_user_note`, `matched_photo`, `matched_document`, set by the resolver). A quote the listener typed in themselves is theirs to label.
- **`sermon_moments`**: `client_id` makes offline captures idempotent. `original_timestamp_start` keeps the AI's time after a user correction. `timestamp_source` is `ai`, `user_capture` or `user_correction`. `verification_status` is `unverified`, `user_verified` or `user_corrected`.
- **`scripture_references`**: stores the OSIS id, the parsed book, chapter and verse bounds, `kind` (`explicit`, `spoken`, `inferred`, `allusion`), `confidence`, and `role`.

### Retrieval, chat, and study

| Table | Purpose |
|---|---|
| `source_chunks` | Retrieval units with their locator, `content_hash`, `embedding vector(768)` (HNSW, cosine), and generated `tsv` |
| `chat_threads`, `chat_messages` | Ask AI history. Assistant messages keep `answer jsonb` (confidence, whether the sermon supports it, separate general background, citation stats) plus provider, model, prompt version and usage. Their validated citations are `source_citations` rows with `subject_type = 'chat_message'`. |
| `study_guides` | Generated studies: `format` (eight formats), `status`, `content jsonb` (big idea, primary passage, sections), `artifact_id`. Section citations are `source_citations` rows with `subject_type = 'study_guide'` and the section key as `subject_part`. |

### Jobs and limits

| Table | Purpose |
|---|---|
| `jobs` | The durable queue: `type`, `status`, `payload`, `dedupe_key`, `priority`, `run_after`, `attempt_count`/`max_attempts` (default 3), the lease (`locked_by`, `locked_until`), `progress`/`stage_label` for the UI, `error_code`/`last_error`, `result` |
| `rate_limits` | Per-user fixed-window counters keyed by bucket |

Phase 2+ tables (`flashcards`, `quizzes`, `quiz_attempts`, `media_generations`, `topics`,
`sermon_topics`) are **not created yet**. Each will ship in the migration of the feature that
uses it, so the schema never carries unused tables. The planned shapes:

- `flashcards(sermon_id, front, back, source citations via source_citations, ease, due_at)`
- `quizzes(sermon_id, questions jsonb)` and `quiz_attempts(quiz_id, answers, score)`
- `media_generations(sermon_id, kind audio|video, script_artifact_id, storage path, provider, status)`
- `topics(user_id, name)` and `sermon_topics(sermon_id, topic_id, origin)`

## Functions (RPC)

Retrieval and search functions are `security invoker`, so RLS applies inside them. The few `security definer` functions set an empty `search_path` and check ownership explicitly.

| Function | Purpose |
|---|---|
| `owns_sermon(p_sermon_id)` | Ownership check used in child-table policies (`security invoker`, `stable`) |
| `create_note(p_sermon_id, p_title)` | Creates the `USER_NOTE` source and the note together, so the ordinal is assigned safely (`security definer`, checks ownership) |
| `save_note(p_note_id, p_base_version, p_title, p_content, p_plain_text, p_content_hash, p_blocks, p_client_updated_at)` | Atomic note save with optimistic concurrency. Returns `(status, version)`, where status is `saved` or `conflict` (`security definer` with an explicit ownership check). On conflict the client keeps a conflict copy; nothing is overwritten. Rewrites `note_blocks` and marks the pack stale for finished sermons. |
| `match_source_chunks(p_sermon_id, p_query_text, p_query_embedding, p_match_count)` | Hybrid retrieval: full-text and vector results merged with reciprocal-rank fusion. Works with text only when no embedding is available. |
| `search_library(p_query, p_speaker, p_church, p_series, p_book, p_chapter, p_from, p_to, p_limit)` | Library search across titles, metadata, notes, pack text and Scripture, with filters |
| `consume_rate_limit(p_bucket, p_limit, p_window_seconds)` | Atomically increments the caller's fixed-window counter and returns `true` while under the limit (`security definer`, keyed by `auth.uid()`) |

## Row-level security

- RLS is enabled on **every** table in `public`, and `anon` has no table privileges.
- **Owner policies** use `user_id = (select auth.uid())`, which is indexed and evaluated once per statement.
- **Children** must reference a sermon the caller owns on insert and update (`owns_sermon`).
- **System tables** (`jobs`, `ai_artifacts`, `source_chunks`, `source_citations`) are read-only for users. Only the worker writes them, using the privileged connection after checking ownership itself.
- **Column-level grants** limit what a user can change. On Pack items that means display text, timestamps (with `timestamp_source` and `verification_status` on moments), `hidden`, `user_edited`, and workflow fields such as application or review status. It never includes `origin`, `pack_artifact_id`, `kind`/`confidence` on Scripture, or quote type and evidence. Users may insert only user-origin moments, Scripture references, applications and questions (captures, additions).
- **Tests.** `tests/integration/rls.test.ts` signs in two real users and checks that user B cannot read, update or delete user A's rows, call RPCs against them, or read A's storage objects.

## Storage

| Bucket | Size cap | Allowed types | Writers |
|---|---|---|---|
| `photos` | 30 MB | JPEG, PNG, WebP, HEIC/HEIF, GIF | Browser via signed upload URL |
| `media` | 2 GB | Common audio and video types | Browser via resumable (TUS) upload with the user's session |
| `documents` | 50 MB | PDF, plain text, Markdown | Browser via signed upload URL |
| `derived` | 10 MB | WebP previews | Worker only |

Every bucket is private. Object policies require the first path segment to equal the caller's
user id (`<user>/<sermon>/<file>`), and the server chooses every path. Reads use short-lived
signed URLs issued after an ownership check (`/api/media/[sourceId]/url`).

## Deletion and export

- **Deleting a sermon** cascades to every child row. Its storage objects are removed by the
  service in `lib/sermons/service.ts` before the row is deleted.
- **Deleting an account** (`DELETE /api/account`) removes storage objects, then the auth user,
  whose foreign keys cascade to all data.
- **Export** (`GET /api/account/export`) returns JSON of every row the user owns, plus signed
  download links for their files (valid for 24 hours).
