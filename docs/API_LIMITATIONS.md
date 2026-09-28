# External API limitations

What each external service can and can't do for this product, what we do about it, and what
we deliberately don't do. Facts were checked against provider documentation on 2026-09-28
(sources at the end). Provider terms change often, so re-check before relying on any number.

## What the product never does

- **No YouTube media download, transcript scraping, or undocumented endpoints.** The app
  sends only a public video's URL to the AI provider, through the provider's documented
  YouTube input. Everything else about a video comes from the official Data API, oEmbed, or
  the user.
- **No dependency on Gemini Notebook, NotebookLM or Meta Muse.** None of them has a public
  API that could import a notebook or produce this product's outputs. The integration
  registry reports them as `UNAVAILABLE`, and no feature needs them.
- **No verse text from memory.** Scripture is shown by reference until a licensed Bible text
  provider is integrated.
- **No single-model dependency.** Every model call goes through the `ModelProvider`
  interface. Without AI, notes, photos, playback, library search and Scripture detection all
  still work.

## Google Gemini API

| Topic | Limitation | How the app handles it |
|---|---|---|
| **YouTube URL input** | **Preview** feature. Public videos only, not private or unlisted. Free tier: at most 8 hours of YouTube video per day; paid tier: no length-based limit. Pricing and limits "are likely to change". Gemini 2.5+ accepts up to 10 videos per request. | Only public, non-live videos are sent. Private and unlisted videos get `media_private` and the upload/notes fallback. Metadata from the Data API is checked first when a key is configured. The integration status shows this path as `PREVIEW`. |
| **Files API** (uploaded recordings) | 2 GB per file and 20 GB per project. Files are kept for 48 hours, and user-uploaded files can't be downloaded back. | Files are uploaded just before analysis and deleted right after (`releaseMedia` in `finally`). The 2 GB app limit matches the per-file cap. Concurrency is bounded by `WORKER_CONCURRENCY`, well under the project cap. |
| **generateContent** | Google now labels the Generate Content API "legacy" and presents the Interactions API as primary. It is still documented and supported. | The Gemini adapter is isolated in `lib/ai/providers/gemini`. Moving to another API surface changes only that folder. |
| **Rate limits and quotas** | Per-model RPM, TPM and RPD limits by tier. | `rate_limited` retries with backoff; `quota_exceeded` fails with an admin-facing message. Per-user app limits cap spend. |
| **Output reliability** | JSON-schema output can still come back truncated or wrong. | Zod validation, one repair pass, then a retryable failure (see AI_PIPELINE.md). |
| **Timestamps** | Model timestamps for long media are approximate. | Timestamps are shown as "~", confidence is stored, user corrections always win, and item times come only from cited segments. |
| **Model names and prices** | Preview models change; the introductory Flash pricing ends 2026-12-31. | Models are env-configurable. `lib/ai/pricing.ts` returns no estimate for an unknown model rather than a wrong one. |

### Data use

Under the Gemini API terms, **paid services** don't use prompts (including files) or
responses to improve Google's products. **Unpaid services** (the free quota and AI Studio)
may use submitted content and responses to improve products, and human reviewers may read
them. With a Cloud Billing account active, all Gemini API use counts as a paid service. In
the EEA, Switzerland and the UK, the paid-service terms apply to all use.

**Therefore: run production with a billing-enabled project.** A sermon notebook holds
personal reflections and prayer notes. The Finish dialog and the Profile page tell users
which provider receives which content.

## YouTube

| Service | Limitation | How the app handles it |
|---|---|---|
| **Data API v3** | Default quota is 10,000 units per day. `videos.list` costs 1 unit per call (up to 50 ids). Needs an API key. | One call per attached video, and only when `YOUTUBE_API_KEY` is set. The app works without it. |
| **oEmbed** | Returns title, channel and thumbnail only: no privacy, duration or live status. It's a public but informally documented endpoint. | Best-effort fallback. A failure is ignored, and the user can type the metadata. |
| **IFrame Player API** | Needs `youtube.com` scripts and frames, so blockers and strict networks stop it. The owner can disable embedding. | CSP allows the YouTube origins. If the player can't load, "Open on YouTube" is offered at the same time, and notes, photos and the pack still work. |

## Supabase

| Topic | Limitation | How the app handles it |
|---|---|---|
| **Upload size** | A project-wide limit caps every bucket: **at most 50 MB on the Free plan**, configurable up to 500 GB on Pro and above. | Bucket caps are set in the migration. DEPLOYMENT.md requires raising the global limit for recordings. Photos and documents fit the Free plan. |
| **Resumable uploads (TUS)** | 6 MB chunks are required. | The client uses 6 MB chunks with retries. **Verified against the local Supabase stack only.** |
| **Auth email** | The built-in SMTP sender is rate-limited. | Configure custom SMTP for production. |

## Vercel (if used)

| Topic | Limitation | How the app handles it |
|---|---|---|
| **Cron** | Hobby plans allow only daily cron jobs; Pro allows per-minute. | The cron drain is optional. A long-running worker is the primary runner. |
| **Function duration** | Functions are stopped at their maximum duration. | On Vercel, web-tier drains run YouTube analysis within the function limit and skip uploaded-recording analysis (`WEB_DRAIN_MEDIA=auto`), which the worker runs. |

## Bible text

Verse text for most modern translations is copyrighted and licensed per translation. The
planned adapter is API.Bible, which needs an API key and per-translation terms. **It is not
implemented.** `BIBLE_PROVIDER` is reserved, and the integration status reports it as
`UNAVAILABLE` or `DISABLED`, never `AVAILABLE`. Until it exists, the app shows references
only and says so.

## Not integrated, by design

| Service | Why |
|---|---|
| Gemini Notebook / NotebookLM Enterprise API (audio overviews) | Pre-GA and enterprise-only. Audio recaps (Phase 3) will use the app's own script → TTS pipeline, with this as an optional provider at most. |
| Standalone Podcast API | Deprecated, no new allowlisting |
| Meta Muse | No API for notebook, podcast or video import. Meta's model API could one day be another text provider behind `ModelProvider`. |
| Transcript downloaders or scrapers | Against YouTube's terms and fragile. Not used. |

## Verification status

| Integration | Verified how |
|---|---|
| Supabase (Auth, Postgres, Storage, TUS) | Automated tests against the local Supabase CLI stack. **Not yet on a hosted project.** |
| Gemini API | Adapter unit tests: error classification and schema conversion. **No live call yet; no key was available.** Run `npm run eval -- --provider=gemini` first. |
| YouTube Data API / oEmbed | Unit-tested parsing of documented response shapes. **No live call from this environment.** |
| YouTube IFrame API | Integration code written against the official reference. The E2E sandbox blocks YouTube, so only the fallback path is exercised automatically. |
| API.Bible | Not implemented |

## Sources

- [Video understanding — Gemini API](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding) (YouTube URL preview, public-only, 8 h/day free tier, 10 videos per request)
- [Files API — Gemini API](https://ai.google.dev/gemini-api/docs/files) (2 GB per file, 20 GB per project, 48-hour storage)
- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (paid vs. unpaid data use)
- [YouTube Data API overview](https://developers.google.com/youtube/v3/getting-started) (quota)
- [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) (50 MB Free, 500 GB Pro+, global limit)
- [Vercel cron jobs — usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) (Hobby daily-only)
