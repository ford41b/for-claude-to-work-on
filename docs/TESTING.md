# Testing

| Layer | Command | Needs | What it proves |
|---|---|---|---|
| Lint | `npm run lint` | — | ESLint (Next core-web-vitals, TypeScript, React Compiler rules), zero warnings allowed |
| Types | `npm run typecheck` | — | Strict TypeScript across app, lib, tests and evals |
| Unit | `npm test` | — | Pure logic, plus the offline eval suites |
| Integration | `npm run test:integration` | Local Supabase | RLS isolation, the full job pipeline, queue semantics, Ask AI and studies, against a real Postgres, Auth and Storage |
| End-to-end | `npm run test:e2e` | Local Supabase, a production build | The real UI on mobile and desktop viewports |
| Evals | `npm run eval` | Nothing for the offline suites; an AI key for the model suite | Scripture detection, grounding enforcement, model quality |
| All fast checks | `npm run check` | — | Lint, typecheck and unit tests |

## Unit tests (`tests/unit/`)

| File | Covers |
|---|---|
| `scripture.test.ts` | Reference normalization (abbreviations, spoken numbers, ordinals, ranges, allusions), invalid references, prose that looks like a reference ("I am 5", "the numbers 6 and 7"), overlap de-duplication, OSIS helpers |
| `youtube.test.ts` | URL variants, rejections with the right message, time offsets |
| `youtube-metadata.test.ts` | Data API and oEmbed response handling (documented shapes), privacy, live and age status, fallbacks when there's no key, the key fails, or the network is down |
| `timestamps-hash.test.ts` | Timestamp parsing, formatting, clamping; stable hashing |
| `note-document.test.ts` | The ProseMirror document schema, block derivation, plain text |
| `ai-structured.test.ts` | Provider schema conversion, lenient enums, `runPrompt` repair and failure, the fixture provider, Gemini error classification |
| `pack-resolve.test.ts` | Citation dropping, timestamps from evidence, verbatim downgrade, Scripture validation, metadata rules |
| `evals.test.ts` | The **scripture** and **grounding** eval suites must meet their targets, so trust regressions fail CI |

## Integration tests (`tests/integration/`)

These run against the local Supabase stack with the fixture AI provider (`.env.test`). Tests run
serially and create their own users.

| File | Covers |
|---|---|
| `rls.test.ts` | Profile and settings creation on sign-up. Owner-only reads; another user can't update or delete a sermon, or attach captures to it. Users can add their own captures but not AI-origin rows. System tables are read-only. Provenance columns can't be forged. Optimistic-concurrency note saves with derived blocks. Storage isolation by user folder. Search and retrieval RPCs scoped to the caller. Per-user rate limits. Cascading deletes. |
| `pipeline.test.ts` | Sources are processed before Finish without building a pack. A grounded Sermon Pack is built after Finish. Every source is indexed for hybrid retrieval. User edits and corrected timestamps survive regeneration. An unchanged recording is not re-analyzed. Ask AI answers with validated citations and saves the thread. A cited Bible study is generated in the requested format. Review actions are recorded without scoring. A corrected photo transcription stays current when the photo is processed again, and the rebuild uses it. Private videos are explained and fall back without retrying. Ask AI refuses, without saving the question, while search indexing is pending or when there is nothing to search. |
| `queue.test.ts` | Active jobs are de-duplicated by key. Each job is claimed once (`SKIP LOCKED`) and retried with backoff until attempts run out. Permanent failures aren't retried. Expired leases are reclaimed, and jobs out of attempts are failed. Backoff is bounded. |

## End-to-end (`tests/e2e/`)

Playwright, with two projects: **mobile** (Pixel 7) and **desktop**. The config builds nothing
itself. Run `npx next build` first, then:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e   # path only needed in sandboxes
```

The web server runs `next start -p 3100` and the worker (`WORKER_HEALTH_PORT=3199`), both with
the fixture AI provider and `YOUTUBE_METADATA=off`.

| Test | Flow |
|---|---|
| North-star flow | Sign up → paste an invalid link (inline error), then a valid one → type notes (local-first "Saved") → upload a slide photo → Finish (with the disclosure dialog) → staged processing → Sermon Pack (big idea, main ideas, timeline, Scripture, source chips; a note citation deep-links to its block) → correct a main idea ("edited by you") → Sermon tab (verbatim evidence vs paraphrase labels; hide and undo) → Ask AI with citations → Bible study → library search by note text and by passage → delete |
| Uploaded recording | Rights confirmation → resumable upload of a WAV file → pack → a timestamp chip seeks the `<audio>` element |
| Private YouTube video | The fixture's private-video id → the source is shown as unavailable, with both fallbacks |
| Sunday Mode offline | Go offline → type a note and bookmark a moment ("Saved on this device") → back online → both sync, and the note and capture appear in the notebook |

Screenshots of each major screen are saved to `test-results/**/NN-*.png` for design review.

Environment notes:

- In the sandbox where this was built, the YouTube IFrame API can't load (the network blocks
  it), so the E2E suite checks the player's graceful fallback, not real YouTube playback.
- The server log may show `Error: The destination stream closed early` during the north-star
  test. That is Next.js reporting that the test navigated away while a streamed page was
  still rendering. It doesn't affect the user or the assertions.

## Fixture AI provider

`lib/ai/providers/fixture` returns deterministic, clearly synthetic output shaped by its inputs.
It cites the keys it was given and uses the detected Scripture. Two special video ids:

- `Fx7WaitSrm1` analyzes normally.
- Any id starting with `Fx7Private` fails with `media_private`.

It exists so the pipeline, UI and tests run without network access or cost. It must never run
in production. It needs both `AI_PROVIDER=fixture` and `ALLOW_FIXTURE_AI=true`, and the app
shows a "Test AI provider active" banner while it's on.

## Evals

`evals/` measures quality rather than correctness:

```bash
npm run eval                                  # scripture + grounding; model if a provider is configured
npm run eval -- --suite=model --provider=gemini
npm run eval -- --suite=model --provider=fixture   # harness check only (advisory)
npm run eval -- --json=evals/results/run.json
```

| Suite | Data | Metrics (target) |
|---|---|---|
| `scripture` | 64 gold sentences: explicit, abbreviated, spoken, ranges, allusions, and 18 negative cases | precision (≥ 97%), recall (≥ 95%), exact-case rate (≥ 95%), kind accuracy (100%), negative false hits (≤ 1) |
| `grounding` | A synthetic notebook (7 recording segments, 4 note blocks, 1 slide) plus adversarial pack drafts | valid Scripture kept (100%), genuine verbatim kept (100%); invented keys leaked, invented verbatim leaked, invalid Scripture leaked, unsupported Scripture shown as detected, timestamps out of range or without timed evidence, untimed timeline moments (**all 0**) |
| `model` | The same notebook, run through the real pack and Q&A prompts | raw key validity (≥ 98%), items without sources (≤ 10%), raw verbatim precision (≥ 90%), Scripture recall (≥ 80%), invented Scripture (0), correct primary passage, unsupported claims (0), big idea attributed to the sermon, in-scope questions supported (100%), expected source cited (≥ 66%), out-of-scope refused (100%), invalid Q&A citations (0), plus latency and estimated cost |

Current results:

- **scripture**: pass. One documented known miss: "Job 5 was a hard week" is read as Job 5.
- **grounding**: pass. The suite also catches deliberate resolver breakage: disabling the
  verbatim check or the key check turns it red.
- **model**: **not yet run against a real model.** No API key was available in the build
  environment. The synthetic provider run shows the harness works, and it correctly fails the
  fixture on citing the expected source and on out-of-scope refusal.

The model suite doesn't exercise retrieval, because every unit is offered as evidence.
Retrieval is covered by the integration tests against a real database.

## Quality gate

Each milestone ends with lint, typecheck, unit, integration, `next build`, the E2E suite, and
the offline evals, all green. The model eval is required before changing a prompt or a model.
