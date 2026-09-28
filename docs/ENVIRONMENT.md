# Environment

Configuration is validated once, at first use, by a Zod schema in `lib/config/env.ts`, which
imports `server-only`. A missing or malformed required value fails fast with a readable error
naming the variable. The template is `.env.example`.

## Variables

### Public (sent to the browser)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key (or the legacy anon key). Safe for browsers: RLS enforces access. |
| `NEXT_PUBLIC_SITE_URL` | Production | Absolute site URL for auth redirects and email links. Defaults to `http://localhost:3000`. |

### Server only

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Yes | Supabase secret key (or the legacy service-role key). Used only for storage signing, admin auth operations (account deletion), and storage cleanup. **Never** send it to the browser. |
| `DATABASE_URL` | Yes | Direct Postgres URL for the worker and privileged writes (transactions, `SKIP LOCKED`). Hosted: the Supavisor pooler in **transaction mode** (port 6543). The client already uses `prepare: false` for it. |
| `DATABASE_POOL_MAX` | No (5) | Connections per process |
| `AI_PROVIDER` | No | `gemini`, `none`, or `fixture`. Defaults to `gemini` when `GEMINI_API_KEY` is set, otherwise `none`. |
| `ALLOW_FIXTURE_AI` | Tests only | Must be `true` for `AI_PROVIDER=fixture`. This two-key guard stops the synthetic provider from being enabled by accident. |
| `GEMINI_API_KEY` | For AI | Google AI Studio / Gemini API key. **Use a paid-tier project for real user content**; see [API_LIMITATIONS.md](API_LIMITATIONS.md#data-use). |
| `GEMINI_MODEL_MEDIA` | No (`gemini-3.8-flash`) | Model for video, audio, photo and document understanding |
| `GEMINI_MODEL_SYNTHESIS` | No (`gemini-3.8-flash`) | Model for the Sermon Pack, Ask AI answers and Bible studies. `gemini-3.1-pro-preview` gives more depth at higher cost. |
| `GEMINI_MODEL_FAST` | No (`gemini-3.1-flash-lite`) | Model for question classification and JSON repair |
| `GEMINI_EMBEDDING_MODEL` | No (`gemini-embedding-001`) | Model for retrieval embeddings, requested at 768 dimensions |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key, for privacy, live status and duration. Without it only oEmbed title and channel are available. |
| `YOUTUBE_METADATA` | No (`auto`) | `off` skips all YouTube metadata network calls (tests, offline work) |
| `BIBLE_PROVIDER`, `API_BIBLE_KEY`, `API_BIBLE_BIBLE_ID`, `API_BIBLE_TRANSLATION_LABEL` | No | **Reserved.** No adapter exists yet, so setting them has no effect beyond the integration status. |
| `CRON_SECRET` | Production | Bearer token for `POST /api/internal/jobs/run`, compared in constant time. Without it that endpoint refuses every request. |
| `WORKER_CONCURRENCY` | No (3) | Jobs one worker runs in parallel (1–16) |
| `WORKER_HEALTH_PORT` | No | When set, `npm run worker` serves `{"status":"ok"}` on that port for probes |
| `WEB_DRAIN_MEDIA` | No (`auto`) | Whether after-request and cron drains may run the long `ANALYZE_VIDEO`/`ANALYZE_AUDIO` jobs. `auto` means yes, except on Vercel (detected from `VERCEL`), where a function can be stopped mid-job. There, web drains still run YouTube analysis (one provider request, cut to fit the function) but leave uploaded recordings to the long-running worker. `off` leaves all media analysis to the worker. |
| `INLINE_WORKER` | No | `off` stops web requests from draining the queue in the background after they enqueue work (see `kickWorker`) |
| `LOG_LEVEL` | No (`info`) | `debug`, `info`, `warn` or `error`. Logs are structured JSON and never include note, transcription or answer text. |

## Files

| File | Tracked | Purpose |
|---|---|---|
| `.env.example` | Yes | The template. Every variable, documented. |
| `.env.local` | **No** | Your local values. Next.js, the worker and the tests all read it. |
| `.env.test` | Yes | Overrides for automated tests only (`AI_PROVIDER=fixture`, `ALLOW_FIXTURE_AI=true`, `YOUTUBE_METADATA=off`, `LOG_LEVEL=warn`). Contains no secrets. |

## Local setup

```bash
npm install
npm run db:start               # starts local Supabase in Docker and prints its keys
cp .env.example .env.local     # then fill in the values below
```

Values for `.env.local` from `npx supabase status`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
SUPABASE_SECRET_KEY=<SECRET_KEY>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
CRON_SECRET=<any long random string>
```

Add `GEMINI_API_KEY` to turn on AI features. Without it, `AI_PROVIDER` resolves to `none` and
the app runs with AI features clearly disabled.

If your network can't reach the default Supabase image registry, run
`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npm run db:start`.

## Secret handling

- Only the three `NEXT_PUBLIC_*` values can reach the browser. Next.js inlines only variables
  referenced literally with that prefix.
- `lib/config/env.ts`, `lib/supabase/admin.ts`, `lib/db/admin.ts`, `lib/ai/registry.ts` and the
  Gemini provider import `server-only`. Importing any of them from a client component fails the
  build.
- Secrets never appear in logs, job rows, error messages or API responses. AI errors keep
  provider detail in job logs only and show users a fixed, safe message.
- In production, store secrets in the host's secret manager (Vercel project environment
  variables, the container platform's secrets). Rotate `CRON_SECRET` and the Gemini key
  independently, since neither is stored in the database.
