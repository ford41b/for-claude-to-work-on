# Deployment

The app has three parts:

1. **Supabase**: Postgres, Auth and Storage.
2. **The Next.js web app**.
3. **The job worker**, which processes sources, builds packs and makes embeddings.

The web app and worker share one codebase and one environment.

> Status: everything here has been run **locally** (Supabase CLI stack, `next start`, the
> worker). A hosted deployment has not been done from this repository yet. Treat this as the
> plan, and check each step against the current Supabase and Vercel docs when you do it.

## Topologies

| Option | Web | Worker | Good for |
|---|---|---|---|
| **A. One Node host** (VM, container platform) | `npm start` | `npm run worker` in a second process | Simplest setup. Long media analysis runs fine. |
| **B. Vercel + worker container** (recommended at scale) | Vercel | A long-running container (Fly.io, Railway, Render, Cloud Run with a minimum instance, …) running `npm run worker` | Serverless web tier. Media analysis runs in the worker. |
| C. Vercel only | Vercel | After-request drains (including while a sermon page polls its status) and, optionally, Vercel Cron → `/api/internal/jobs/run` | **Enough for YouTube sermons, not for uploaded recordings.** Serverless functions are stopped at their time limit (`maxDuration` 300 s on the draining routes). A YouTube analysis is one provider request, so web-tier drains run it with its time limit cut to fit the function; an attempt that runs out retries. Uploaded recordings (`ANALYZE_AUDIO`, uploaded `ANALYZE_VIDEO`) need a download and re-upload, so they still wait for a worker (`WEB_DRAIN_MEDIA=auto`). |

However many runners you use, each job is claimed exactly once (`FOR UPDATE SKIP LOCKED`
with leases). Running the worker, the after-request drain and the cron drain together is safe.

## 1. Supabase

1. Create a project in the region nearest your users. Note the project URL, the
   **publishable** key, the **secret** key, and the **pooler** connection string (transaction
   mode, port 6543) for `DATABASE_URL`.
2. Apply the migrations:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   This creates the schema, RLS policies, RPCs and storage buckets.
3. **Auth settings** (dashboard → Authentication). `supabase/config.toml` configures only the
   local stack, so set these by hand:
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**`
   - Minimum password length: 8 or more
   - Email templates: copy `supabase/templates/magic_link.html` and `confirmation.html`.
     They link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/home`,
     which the app verifies server-side.
   - Custom SMTP: set this up for production volume. The built-in sender is rate-limited.
4. **Storage upload limit.** Recordings can be up to 2 GB, but the project-wide upload limit
   caps every bucket. **On the Free plan that limit can't exceed 50 MB**, so most sermon
   recordings would be rejected. On Pro and above, raise it to at least 2 GB (dashboard →
   Storage → Settings). Photos (30 MB) and documents (50 MB) fit on any plan.
5. Leave "Enable Data API" on. The app uses PostgREST with RLS for user-scoped reads.

## 2. Web app

Set the environment variables from [ENVIRONMENT.md](ENVIRONMENT.md) (`NEXT_PUBLIC_SITE_URL`
is the public origin), then:

```bash
npm ci
npm run build
npm start            # or deploy to Vercel: framework preset Next.js, Node ≥ 22.12
```

Already built in:

- **Nonce-based CSP** (`proxy.ts`), with YouTube script and frame origins allowed.
- **Security headers** (`next.config.ts`): HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, and a `Permissions-Policy` that allows the camera only for this site.
- **Session refresh** on every request, and redirects for protected routes.

Also set `CRON_SECRET`. Without it the internal drain endpoint refuses every call.

## 3. Worker

```bash
npm ci
npm run worker       # tsx --conditions=react-server scripts/worker.ts
```

- **Environment**: the same variables as the web app. The worker needs `DATABASE_URL`,
  `SUPABASE_SECRET_KEY`, and the AI keys.
- **Health**: set `WORKER_HEALTH_PORT=8080` and point a liveness probe at it. It returns
  `{"status":"ok"}`, or `"stopping"` during shutdown.
- **Shutdown**: on SIGTERM it stops claiming work and waits for in-flight jobs. Give it a
  grace period of a few minutes. A job cut off anyway is re-claimed when its lease expires
  (20 minutes for media analysis, 6 minutes for other jobs).
- **Sizing**: `WORKER_CONCURRENCY=3` suits a 1 vCPU / 1 GB container. Media analysis spends
  most of its time waiting on the provider. Photo processing (sharp) is the only CPU-heavy
  step. Temporary media files go to the OS temp dir, so allow disk space for your largest
  recording (up to 2 GB).

### Optional: Vercel Cron as a backup drain

On Vercel Pro (Hobby only allows daily crons), add a `vercel.json`:

```json
{ "crons": [{ "path": "/api/internal/jobs/run", "schedule": "* * * * *" }] }
```

When the `CRON_SECRET` environment variable is set, Vercel sends it as
`Authorization: Bearer <CRON_SECRET>`, and the route accepts `GET` or `POST`. Each run drains
for up to 240 s (`maxDuration = 300`).

## 4. AI provider

- Set `GEMINI_API_KEY` from a Google Cloud project **with billing enabled**, so the paid-service
  data terms apply. See [API_LIMITATIONS.md](API_LIMITATIONS.md#data-use).
- Optionally set `YOUTUBE_API_KEY` (YouTube Data API v3) for privacy and live-status checks
  before analysis.
- Before launch, run `npm run eval -- --provider=gemini` and check the model metrics.
- Watch for `quota_exceeded` and `rate_limited` job errors. Jobs record usage and estimated
  cost; query `jobs.usage`.

## 5. Launch checklist

- [ ] Migrations applied; `npm run db:types` output matches the committed `types/database.ts`
- [ ] Auth Site URL, redirect URLs and email templates set; custom SMTP configured
- [ ] Storage global upload limit ≥ 2 GB (Pro plan), or recordings disabled in the copy
- [ ] `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` and `GEMINI_API_KEY` (billing enabled) set, and
      `AI_PROVIDER` **not** `fixture`
- [ ] A worker is running and healthy (required for recordings on serverless hosts)
- [ ] Sign up, magic link, the YouTube flow, a photo upload, a recording upload, Finish, Ask AI,
      a study, export and delete all pass on the deployed URL
- [ ] Two-account check on the deployed URL: account B can't open account A's sermon URLs
- [ ] Backups: Supabase daily backups (Pro), plus point-in-time recovery if required
- [ ] Error monitoring on the web app and worker (structured JSON logs go to stdout)

## Operations

- **Stuck work can't hide.** Processing status is computed from `jobs`. A job whose lease
  expires is retried or failed by the sweeper, and the UI then shows a retry action.
- **Re-running a source**: the source's retry action (`POST /api/sources/:id/retry`) forces
  reprocessing and bypasses the cache.
- **Prompt or model changes**: bump the prompt version. Existing packs stay until their
  sermon changes or the user chooses rebuild. Media analyses re-run only when requested.
- **Deleting user data**: account deletion removes storage objects and the auth user, and
  database rows cascade. Provider-side media copies are deleted right after analysis (and
  Google removes Files API uploads after 48 hours regardless).
