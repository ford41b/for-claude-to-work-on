# Source grounding

A listener has to be able to tell, for every sentence in their notebook:

- **who is speaking**: themselves, the sermon, Scripture, or the AI;
- **where it came from**: which note, which moment of the recording, which photo or page;
- **how sure we are**: word-for-word or paraphrase, and whether a time is approximate or confirmed.

This document describes how the code guarantees that. Where a rule is enforced, the file that
enforces it is named.

## The five voices

| Voice | Label in the UI | Comes from | Never |
|---|---|---|---|
| **You** | "Your note", "You bookmarked" | Notes, captures, corrections | Rewritten by AI. AI output can quote a note, but the note itself only changes when the user edits it. |
| **Sermon** | "Sermon ~18:42", "Heard word-for-word" | The recording analysis, and slides or handouts from the service | Presented as verbatim without evidence |
| **Scripture** | "Romans 8:24–25", with kind and confidence | References detected or cited, each validated | Invented, or shown with made-up verse text |
| **AI** | "AI summary", "AI answer", "General context (not from this sermon)" | Synthesis over the sources | Presented as the speaker's words, or left unlabeled |
| **Photo / document** | "Photo 2 (slide)", "Handout, page 3" | Transcriptions and extracted pages | Presented as certain when the transcription is unclear (`[unclear]` markers and confidence are kept) |

`components/sources/source-chip.tsx` renders every voice with the same `VoiceTag` and
`SourceChip` components, so a label can't drift between screens.

## Evidence units and source keys

Before any synthesis, `buildCatalog()` (`lib/sources/catalog.ts`) turns a notebook into
citable units with short keys:

| Key | Unit | Locator kept |
|---|---|---|
| `V1…Vn` | A segment of the recording analysis | Start and end seconds, timing confidence, phrases heard word-for-word |
| `N1…Nn` | A note block, or a small group of blocks from one note | Note block ids (deep link `…/notes#block-<id>`), captured time if any |
| `P#` | A photo's current transcription (`#` is the photo's number) | Photo source, captured time if any |
| `D#.p#` | A document page | Page number |
| `C#` | A capture (bookmark, "important", question) | Captured time |

The model sees only these keys and their text. It never sees database ids, and it cannot
cite anything that isn't in the catalog.

## What the resolver enforces

`resolvePack()` (`lib/pack/resolve.ts`) runs on every Sermon Pack draft before anything is
stored. Bible studies (`lib/jobs/handlers/generate-study.ts`) and Ask AI answers
(`lib/retrieval/ask.ts`) apply the same key rule: only keys that were provided become
citations.

1. **Citations must resolve.** Keys that aren't in the catalog are dropped and counted
   (`stats.droppedKeys`). An item left with no valid citation is counted in
   `stats.itemsWithoutSources`, and the UI shows it without source chips rather than with
   invented ones.
2. **Timestamps come from evidence, never from the model.** The pack schema has no timestamp
   fields. An item's time is derived from the recording segments it cites:
   - the earliest cited start, and the latest end within 15 minutes of it;
   - clamped to the recording's duration;
   - confidence is the lowest confidence among the cited segments, and drops to `low` when
     the citations are spread apart.

   With no segment cited, a user-captured time (a timestamped note or capture) may be used,
   at `medium` confidence. Otherwise the item has no time. When a recording exists, timeline
   moments without a time are dropped, because a moment you can't jump to isn't navigable.
3. **Verbatim needs evidence.** A quote the model labels `VERBATIM_QUOTE` stays verbatim only
   if its normalized text appears in the **cited** unit's verbatim phrases: words the analysis
   heard word-for-word, or the literal text of a note, photo or page. Otherwise it's
   downgraded to `PARAPHRASE` (`stats.quotesDowngraded`), and quote marks are stripped. The
   kind of evidence is stored (`heard_verbatim`, `matched_user_note`, `matched_photo`,
   `matched_document`). The database rejects an AI verbatim quote without evidence (a check
   constraint on `quotes`).
4. **Scripture must parse, exist, and be supported.**
   - Every reference goes through the parser (`lib/bible/reference.ts`), which checks book,
     chapter and verse bounds. Invalid references are rejected (`stats.scriptureRejected`).
   - References found deterministically in the sources are the base set, with kind
     `explicit`, `spoken` or `allusion`.
   - A reference only the model named is kept only if it cites a real unit. It is then marked
     `inferred`, at `medium` confidence (`low` if spoken or allusive), never `explicit`. With
     no valid citation it's dropped.
5. **Metadata suggestions never overwrite the user.** AI title, speaker, church, series and
   date suggestions apply only at `medium` or `high` confidence, only in the right format,
   and only to fields not in `sermons.corrected_fields`.

## User edits survive rebuilds

`persistPack()` (`lib/pack/persist.ts`) writes a new pack version in one transaction:

- AI items the user hasn't touched are replaced.
- Items the user edited, hid or created are kept as they are. New AI items that duplicate a
  kept item are skipped.
- A corrected moment time is stored with `timestamp_source = 'user_correction'` and
  `verification_status = 'user_corrected'`. The AI's original time is kept in
  `original_timestamp_start`. Later rebuilds never change a corrected time.
- A photo transcription the user corrected becomes a new current `ocr_extractions` version
  with `origin = 'user'`. Later AI runs are stored but don't become current.
- Review items the user has acted on keep their state.
- The previous pack is marked `superseded`, not deleted, so versions can be compared.

`tests/integration/pipeline.test.ts` covers this: it edits an item, corrects a timestamp,
rebuilds, and asserts that both survive.

## Ask AI grounding

- Evidence units are keyed `K1…K10` for each question.
- After the model answers, every `[K#]` marker and every `cited_keys` entry is checked against
  the keys that were actually provided. Unknown markers are removed from the text, and valid
  ones become citations that link to the exact note block, photo, page or moment.
- If the evidence doesn't answer the question, the prompt requires the model to say so and
  set `supported_by_sermon = false`. The UI then shows "Not found in this sermon" instead of a
  confident answer.
- General background is a separate field, shown under "General context (not from this
  sermon)".
- While search indexing is still running, Ask AI refuses with a clear message instead of
  answering from partial evidence.

## Bible text

The app shows **references, never verse text**. That would need a licensed Bible text
provider, and none is implemented yet (see [API_LIMITATIONS.md](API_LIMITATIONS.md)). Studies
say "Verse text isn't included — open your own Bible to the references." Every prompt tells the
model not to write out verse text or quote Scripture from memory (`prompts/shared.ts`,
`study.ts`, and the analysis prompts).

## Measuring it

- `npm run eval -- --suite=grounding` feeds adversarial drafts through the resolver: invented
  keys, invented or misattributed verbatim quotes, fake books and out-of-range verses,
  unsupported references, and a truncated recording. Every leak count must be zero. This
  suite also runs inside `npm test`.
- `npm run eval -- --suite=model` measures how honest a real model is before the resolver
  cleans up: raw key validity, verbatim precision, invented Scripture, unsupported claims,
  and out-of-scope refusals.
