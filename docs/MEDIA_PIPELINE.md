# Media pipeline

How recordings, YouTube links, photos and documents get into a notebook, get checked, and get
played back. What happens to them after analysis is in [AI_PIPELINE.md](AI_PIPELINE.md).

## YouTube sermons

### Parsing (`lib/youtube/parse.ts`)

A pure, dependency-free parser that runs the same in the browser (instant feedback while
pasting) and on the server (the authoritative check).

- **Accepted**:
  - `youtube.com/watch?v=`, `youtu.be/<id>`, and `/embed/`, `/live/`, `/shorts/`, `/v/`, `/e/`
  - the `m.`, `music.` and `youtube-nocookie.com` hosts
  - `attribution_link` redirects
  - URLs without a scheme
  - a `t` or `start` offset (`90`, `90s`, `1m30s`, `1h2m3s`)
- **Rejected, each with its own message**: empty input, text with spaces or over 2 KB, non-HTTP
  schemes, other sites, playlist-only links, channel pages (`/@name`, `/channel/`, `/c/`,
  `/user/`), and malformed video ids.
- Every link is stored as the canonical `https://www.youtube.com/watch?v=<id>`.

### Metadata (`lib/youtube/metadata.ts`, `INGEST_SERMON`)

1. **YouTube Data API v3** (`videos.list`, `part=snippet,contentDetails,status`) when
   `YOUTUBE_API_KEY` is set. It supplies title, channel, publish date, duration, privacy,
   embeddability, live status (`snippet.liveBroadcastContent`), and age restriction.
2. Otherwise **oEmbed** gives title, channel and thumbnail. It's best-effort; a failure is not
   an error.
3. Otherwise nothing. The user can type the metadata, and the notebook works either way.

Official metadata fills only fields the user hasn't set (`sermons.corrected_fields`).
`YOUTUBE_METADATA=off` skips all lookups, for tests and offline development.

### Analysis eligibility

Only **public**, **non-live** videos are sent for direct URL analysis. Gemini's YouTube input
is a Preview feature that supports public videos only.

| Situation | What happens |
|---|---|
| Public video | `ANALYZE_VIDEO` passes the URL to the provider |
| Private or unlisted (from metadata, or `media_private` from the provider) | The source is marked **unavailable**, with: "You can still watch it here if embedding is allowed. To include it in your Sermon Pack, upload a recording you have permission to use, or continue with your notes and photos." |
| Live or upcoming | The source stays **ready** (not failed), with "This livestream hasn't finished yet." Analysis runs when the sermon is finished after the stream ends. |
| Removed or restricted | `media_unavailable`, with the same fallbacks |

The app **does not download YouTube media, scrape transcripts, or call undocumented
endpoints**. See [API_LIMITATIONS.md](API_LIMITATIONS.md).

### Playback (`components/player/`)

- **YouTube**: the official IFrame Player API, loaded from `youtube.com/iframe_api` with the
  `youtube-nocookie.com` host, and allowed by the CSP. `PlayerProvider` exposes `seek(seconds)`
  and `currentTime()` to the whole notebook.
- **Uploads**: a native `<audio>` or `<video>` element. Its source is a private signed URL,
  valid for 3 hours, from `GET /api/media/[sourceId]/url`, issued after an ownership check.
- Every timestamp chip (`TimeLink`) calls `seek`. When the player isn't on screen, the chip
  opens the sermon at that time.
- If the IFrame API can't load (network policy, blocker), the player says so and offers
  "Open on YouTube" at the same time. The E2E suite runs in a sandbox that blocks YouTube, so
  it exercises this path.
- Notes typed while the player is running can be stamped with the current time.

## Uploads

### Flow (`lib/uploads/service.ts`, `lib/client/uploads.ts`)

```
browser                         server                               storage
───────                         ──────                               ───────
POST /api/uploads ─────────▶ validate kind, declared type, size;
  {kind, mimeType, sizeBytes,   rights confirmation for audio/video;
   filename, rightsConfirmed}   reserve sermon_sources + media_files
                                rows; choose the path
                  ◀──────────── signed upload URL (photos, documents)
                                or TUS target (recordings)
PUT / TUS upload ────────────────────────────────────────────────▶ <user>/<sermon>/<file>/<name>
POST /api/uploads/:id/complete ▶ read the first bytes, sniff the real
                                 type (file-type), check size limits;
                                 mismatch → delete object, mark rejected
                                 match    → mark verified, enqueue job
```

- **Paths are always chosen by the server.** Storage policies also require the first path
  segment to be the caller's user id.
- **Limits** (`lib/config/app.ts`, mirrored by bucket caps):

  | Type | Limit |
  |---|---|
  | Photo | 30 MB |
  | Audio | 500 MB |
  | Video | 2 GB |
  | Document | 50 MB |

  The allowed MIME types are listed per kind in the same file.
- **Declared types are never trusted.** After upload, the file's magic bytes must match its
  family (image, audio, video, PDF). Audio in an MP4 container (M4A) is accepted. Plain text
  and Markdown must not look like a binary format.
- **Rights.** Audio and video need "I made this recording or have permission to upload and
  process it." The confirmation time is stored, and the database enforces it with a check
  constraint.
- **Resumable recordings.** Recordings use TUS through Supabase's
  `/storage/v1/upload/resumable` endpoint, with the user's session token, 6 MB chunks, and
  automatic retries. An interrupted upload resumes rather than restarting.

### Photos (`PROCESS_PHOTO`, `lib/media/images.ts`)

- **Originals are stored untouched and private.**
- **Preview**: WebP, at most 1600 px, auto-rotated from EXIF, with **all metadata including
  GPS stripped**. Stored in the worker-only `derived` bucket.
- **Analysis rendition**: JPEG, at most 3072 px, also metadata-free, so handwriting stays
  legible. It's built in memory and never stored.
- **Formats sharp can't decode** (some HEIC): no preview is made, and the original bytes go
  to analysis under their verified type. The UI shows a neutral placeholder.
- **Transcriptions** are versioned (`ocr_extractions`). Unclear words are marked `[unclear]`
  and confidence is kept per block. A user correction becomes the current version and marks
  the pack for a debounced rebuild.
- **Offline photos**: photos taken in Sunday Mode without a connection wait in the IndexedDB
  outbox and upload automatically when the device is back online.

### Documents (`PROCESS_DOCUMENT`)

- **Plain text and Markdown** are read directly and split into pages of about 3,000
  characters (`paginateText`).
- **PDFs** go through `document-analysis`, which returns text per page, so citations can
  point to `D#.p#`.

### Audio and video analysis (`ANALYZE_AUDIO` / `ANALYZE_VIDEO`)

1. Download the verified object to a temp file on the worker (streamed, not buffered in
   memory).
2. `prepareMedia` uploads it to the Gemini Files API. Google keeps Files API uploads for 48
   hours at most.
3. Run `sermon-analysis` at low media resolution, sampling video at 0.5 fps. Audio-only runs
   set `on_screen_text` to null.
4. **Always** call `releaseMedia` in `finally`, which deletes the provider copy right away,
   and remove the temp file.

## Deletion

Deleting a photo, source, sermon or account removes its storage objects (originals,
previews) as well as its rows. Provider-side copies are already gone because of step 4 above.
