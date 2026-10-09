# Berean

Capture a sermon, your notes, and photos of the slides, and turn them into a study notebook
you can trust. Every summary, idea and quote links back to where it came from: your notes, a
moment in the recording, a photo, or a page. What *you* wrote, what the *sermon* said, what
*Scripture* says, and what the *AI* inferred are never blended together.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres,
Auth, Storage, pgvector) and the Gemini API behind a provider interface.

## Quick start

Prerequisites: Node ≥ 22.12 and Docker (for local Supabase).

```bash
npm install
npm run db:start                 # local Supabase; prints the keys you need
cp .env.example .env.local       # fill in the keys (see docs/ENVIRONMENT.md)
npm run dev                      # http://localhost:3000
npm run worker                   # second terminal: processes sources and builds packs
```

- **Add AI features:** set `GEMINI_API_KEY` in `.env.local`. Without it, notes, photos,
  playback, library search and Scripture detection still work, and AI features say they're
  off.
- **Try the full flow without a key:** set `AI_PROVIDER=fixture` and `ALLOW_FIXTURE_AI=true`.
  This synthetic test provider shows a banner and must never run in production.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Long-running job worker |
| `npm run check` | Lint + typecheck + unit tests |
| `npm run test:integration` | RLS, pipeline and queue tests against local Supabase |
| `npm run test:e2e` | Playwright on mobile and desktop (run `npx next build` first) |
| `npm run eval` | Scripture, grounding and model evals |
| `npm run db:reset` / `db:types` | Re-apply migrations / regenerate `types/database.ts` |

## Feature status

What each status means:

- **Done**: implemented, with automated test coverage.
- **Done, not live-verified**: implemented, but its external dependency couldn't be called
  from the build environment.
- **Partial**: part of the feature exists; the gap is named.
- **Mocked**: runs only on synthetic data.
- **Planned**: not built.

### Phase 1 (MVP)

| Feature | Status | Notes |
|---|---|---|
| Accounts: password, magic link, sign-out, session refresh | Done | Supabase Auth; token-hash confirmation route; no custom crypto |
| Private-by-default data, RLS on every table, storage isolation | Done | Two-user integration tests |
| New sermon from a YouTube link | Done | Parser, official metadata (Data API or oEmbed), embed player with seek |
| YouTube video analysis | **Done, not live-verified** | Uses Gemini's YouTube URL input (Preview, public videos only). Pipeline tested with the synthetic provider. |
| Private, unlisted or unavailable video fallback | Done | Explains why; offers upload, or notes and photos |
| Upload a recording (audio or video) | Done | Rights confirmation, resumable TUS upload, magic-byte check, native player with seek. Hosted Supabase Free caps uploads at 50 MB (see DEPLOYMENT). |
| Recording analysis via the Gemini Files API | **Done, not live-verified** | Media is deleted from the provider right after analysis |
| Notes editor | Done | Tiptap; local-first autosave; optimistic concurrency with conflict copies; timestamp and Scripture insertion; stable block ids for deep links |
| Sunday Mode | Done | Distraction-free, works offline (IndexedDB drafts + outbox), bookmarks, questions, Scripture, photos; syncs on reconnect |
| Photos: upload, camera, previews, transcription | Done (transcription not live-verified) | EXIF/GPS stripped from previews; versioned transcriptions; user corrections always win |
| Documents (PDF, text, Markdown) | Done (PDF text not live-verified) | Text and Markdown parsed locally; PDFs through the model |
| Deterministic Scripture detection | Done | Explicit, abbreviated, spoken and allusive references; validated; 98% precision on the eval set |
| Finish → staged processing | Done | Real job stages, progressive results, retry actions; status computed from jobs |
| Sermon Pack | **Done, not live-verified** | Big idea, summaries, main ideas, outline, timeline, Scripture, quotes (verbatim vs paraphrase), illustrations, applications, questions, terms, review items; every item cited |
| Citation, quote and timestamp enforcement | Done | Resolver drops unknown keys, requires evidence for verbatim quotes, derives times from evidence; adversarial eval suite |
| User edits survive rebuilds | Done | Integration test |
| Correcting AI output in the UI | Done | Correct or hide main ideas, outline sections, stories and term definitions; hide quotes (their words stay tied to evidence); edit, hide and add Scripture; correct timeline times and photo transcriptions. Corrections are labeled "edited by you" and survive rebuilds. |
| Ask AI | **Done, not live-verified** | Hybrid retrieval (full text + pgvector, RRF); streamed stages; validated `[K#]` citations that jump to the source; says when the sermon doesn't cover something; general context kept separate |
| Bible study (8 formats) | **Done, not live-verified** | Cited sections; no verse text without a licensed provider |
| Review items and "This week" | Done | Review states without scoring; applications with completion |
| Library and search | Done | Title, speaker, church, series, notes, pack text, passage; filters |
| Profile | Done | Theme, text size, integrations status, export (JSON + signed file links), account deletion |
| Accessibility and mobile | Done (automated coverage partial) | Mobile-first layouts, safe areas, keyboard support, visible focus, reduced motion. E2E runs on Pixel 7 and desktop. No automated axe audit yet. |
| Rate limits, CSP, security headers, secret isolation | Done | See ARCHITECTURE §K |
| Evals | Done (model suite not run live) | Offline suites pass and run in CI. The model suite needs an API key. |

### Later phases

| Feature | Status |
|---|---|
| Verse text beside references (API.Bible or another licensed provider) | Planned; `BIBLE_PROVIDER` reserved. Needs a key and per-translation licensing. |
| Phase 2: flashcards, quiz, Review With Me, weekly review, devotionals, Questions Inbox, topic pages, series pages, cross-sermon AI | Planned. Tables are designed (DATABASE.md) but not created. |
| Phase 2: cross-sermon search | Partial. Library search already spans every sermon (title, metadata, notes, pack text, passage). Semantic cross-sermon retrieval is planned. |
| Phase 3: audio recaps (first-party script → TTS pipeline; optional third-party Audio Overview) | Planned |
| Phase 4: video recaps (deterministic motion graphics first) | Planned |
| Phase 5: church ecosystem (workspaces, official notes, small groups, shared study guides, pastor questions, series collections, org admin) | Planned |
| Gemini Notebook / NotebookLM, Meta Muse | Not integrated; no suitable public API (see API_LIMITATIONS.md) |

### What has not been verified

- **Live model calls.** No Gemini API key was available in the build environment. The whole
  pipeline was exercised end to end with the deterministic synthetic provider. Before
  launch, run `npm run eval -- --provider=gemini`.
- **Live YouTube.** The Data API, oEmbed and IFrame playback aren't reachable from the build
  sandbox. Parsing and fallbacks are unit-tested, and the player's "can't load" path is
  E2E-tested.
- **Hosted Supabase and Vercel.** Everything ran against the local Supabase stack.

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture A–L: components, stack, schema, source model, AI pipeline, jobs, routes, UX flows, dependencies, cost, security, milestones |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, RPCs, RLS, storage, migrations |
| [docs/AI_PIPELINE.md](docs/AI_PIPELINE.md) | Providers, prompts, structured output, errors, jobs, cost controls, evals |
| [docs/SOURCE_GROUNDING.md](docs/SOURCE_GROUNDING.md) | Voices, source keys, citation, quote, timestamp and Scripture rules |
| [docs/MEDIA_PIPELINE.md](docs/MEDIA_PIPELINE.md) | YouTube, uploads, photos, documents, playback |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable, local setup, secret handling |
| [docs/TESTING.md](docs/TESTING.md) | Test layers, E2E, fixture provider, evals and current results |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Topologies, Supabase, web, worker, launch checklist |
| [docs/API_LIMITATIONS.md](docs/API_LIMITATIONS.md) | External API limits, data-use terms, what we deliberately don't do |
| [PRODUCT.md](PRODUCT.md) | Product context and principles |
| [DESIGN.md](DESIGN.md) | Visual system: tokens, type, layout, components, named rules |

## Privacy

- User content is private to its owner and isn't used for training by this app.
- Content goes to the configured AI provider only when the user acts (attach, upload,
  finish, ask, generate), and the app says what is sent.
- Use a billing-enabled Gemini project in production so the paid-service data terms apply.
- Users can export everything or delete their account at any time.
