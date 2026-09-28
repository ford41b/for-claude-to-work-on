import type { Sql } from "@/lib/db/admin";
import { combineHashes } from "@/lib/hash";
import type { CatalogUnit } from "@/lib/ai/prompts/sermon-pack";
import { formatTimestamp, formatTimestampRange } from "@/lib/time/timestamps";
import type { Enums } from "@/lib/supabase/types";

/**
 * The source catalog turns a notebook's evidence into citable units with short keys:
 *   V#  sermon recording segment      N#  note block (or small group of blocks)
 *   P#  photo (# = the photo's number) D#.p#  document page     C#  user capture
 * Synthesis prompts may cite only these keys; `refs` resolves each key back to its source.
 */

export type SourceType = Enums<"source_type">;
export type Confidence = Enums<"confidence_level">;

export interface EvidenceRef {
  key: string;
  kind: CatalogUnit["kind"];
  sourceId: string;
  sourceType: SourceType;
  label: string;
  noteBlockId: string | null;
  noteBlockIds: string[];
  timestampStart: number | null;
  timestampEnd: number | null;
  timestampSource: "ai" | "user_capture" | null;
  page: number | null;
  excerpt: string;
  text: string;
  confidence: Confidence | null;
  /** Word-for-word phrases (segments: heard verbatim; notes/photos: the text itself). */
  verbatimPhrases: string[];
}

export interface SermonRowLite {
  id: string;
  user_id: string;
  title: string;
  speaker: string | null;
  church: string | null;
  series: string | null;
  preached_on: string | null;
  status: Enums<"sermon_status">;
  corrected_fields: string[];
  current_pack_id: string | null;
}

export interface MediaSegment {
  start: number;
  end: number;
  kind: string;
  summary: string;
  key_phrases: string[];
  scripture_mentions: string[];
  on_screen_text: string | null;
  timing_confidence: Confidence;
}

export interface StoredMediaAnalysis {
  is_sermon: boolean;
  content_note: string | null;
  duration_seconds: number | null;
  sermon_start_seconds: number | null;
  sermon_end_seconds: number | null;
  segments: MediaSegment[];
  quotes: { text: string; at: number; heard_verbatim: boolean; confidence: Confidence }[];
  illustrations: { title: string; summary: string; kind: string; start: number; end: number | null }[];
  metadata: Record<string, { value: string | null; confidence: Confidence; basis: string | null }>;
}

export interface SermonCatalog {
  sermon: SermonRowLite;
  units: CatalogUnit[];
  refs: Map<string, EvidenceRef>;
  hasRecording: boolean;
  recording: { sourceId: string; sourceType: SourceType; durationSeconds: number | null; artifactId: string } | null;
  recordingNote: string | null;
  sourceVersionHash: string;
  counts: { segments: number; notes: number; photos: number; documents: number; captures: number };
}

const MAX_NOTE_UNITS = 120;

function excerpt(text: string, max = 280): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function loadSermon(sql: Sql, sermonId: string): Promise<SermonRowLite | null> {
  const rows = await sql<SermonRowLite[]>`
    select id, user_id, title, speaker, church, series, preached_on::text as preached_on, status,
           corrected_fields, current_pack_id
    from public.sermons where id = ${sermonId}`;
  return rows[0] ?? null;
}

/** Latest ready media analysis for the notebook's most recently processed recording. */
export async function loadCurrentRecording(sql: Sql, sermonId: string) {
  const rows = await sql<
    { artifact_id: string; source_id: string; source_type: SourceType; structured_content: StoredMediaAnalysis; input_hash: string | null; duration_seconds: number | null }[]
  >`
    select a.id as artifact_id, a.source_id, s.source_type, a.structured_content, a.input_hash,
           coalesce(v.duration_seconds, au.duration_seconds) as duration_seconds
    from public.ai_artifacts a
    join public.sermon_sources s on s.id = a.source_id
    left join public.video_sources v on v.source_id = s.id
    left join public.audio_sources au on au.source_id = s.id
    where a.sermon_id = ${sermonId}
      and a.type in ('VIDEO_ANALYSIS', 'AUDIO_ANALYSIS')
      and a.status = 'ready'
    order by a.created_at desc
    limit 1`;
  return rows[0] ?? null;
}

type BuiltUnit = [CatalogUnit, Omit<EvidenceRef, "key" | "kind" | "label">];

/** Recording segments → V# units. Heard-verbatim quotes attach to the segment they fall in. */
export function recordingUnits(
  analysis: StoredMediaAnalysis,
  recording: { source_id: string; source_type: SourceType },
): BuiltUnit[] {
  const segments = [...analysis.segments].sort((a, b) => a.start - b.start);
  return segments.map((seg, i) => {
    const heard = [
      ...seg.key_phrases,
      ...analysis.quotes.filter((q) => q.heard_verbatim && q.confidence !== "low" && q.at >= seg.start && q.at <= seg.end).map((q) => q.text),
    ];
    const time = formatTimestampRange(seg.start, seg.end, { approximate: true });
    return [
      {
        key: `V${i + 1}`,
        kind: "segment",
        label: `Sermon ${time}`,
        text: seg.summary,
        details: [
          `Kind: ${seg.kind}`,
          heard.length ? `Heard word-for-word: ${heard.map((h) => `"${h}"`).join(" | ")}` : null,
          seg.scripture_mentions.length ? `Scripture mentioned: ${seg.scripture_mentions.join("; ")}` : null,
          seg.on_screen_text ? `On screen: ${seg.on_screen_text}` : null,
          `Timing confidence: ${seg.timing_confidence}`,
        ].filter((d): d is string => Boolean(d)),
      },
      {
        sourceId: recording.source_id,
        sourceType: recording.source_type,
        noteBlockId: null,
        noteBlockIds: [],
        timestampStart: seg.start,
        timestampEnd: seg.end,
        timestampSource: "ai",
        page: null,
        excerpt: excerpt(seg.summary),
        text: [seg.summary, ...heard, seg.on_screen_text ?? ""].join("\n"),
        confidence: seg.timing_confidence,
        verbatimPhrases: heard,
      },
    ];
  });
}

/** One note block (or a small group from the same note) → an N# unit. */
export function noteUnit(
  key: string,
  group: { source_id: string; block_id: string; text: string; timestamp_seconds: number | null }[],
): BuiltUnit {
  const first = group[0]!;
  const text = group.map((b) => b.text).join("\n");
  const ts = group.find((b) => b.timestamp_seconds !== null)?.timestamp_seconds ?? null;
  return [
    { key, kind: "note", label: ts !== null ? `Your note (at ${formatTimestamp(ts)} in the sermon)` : "Your note", text },
    {
      sourceId: first.source_id,
      sourceType: "USER_NOTE",
      noteBlockId: first.block_id,
      noteBlockIds: group.map((b) => b.block_id),
      timestampStart: ts,
      timestampEnd: null,
      timestampSource: ts !== null ? "user_capture" : null,
      page: null,
      excerpt: excerpt(text),
      text,
      confidence: "high",
      verbatimPhrases: [text],
    },
  ];
}

/** A photo's current transcription → a P# unit (# is the photo's number in the notebook). */
export function photoUnit(p: {
  source_id: string;
  ordinal: number;
  photo_kind: string | null;
  full_text: string;
  overall_confidence: Confidence | null;
  legibility_note: string | null;
  origin: Enums<"item_origin"> | null;
  sermon_timestamp_seconds: number | null;
}): BuiltUnit {
  return [
    {
      key: `P${p.ordinal}`,
      kind: "photo",
      label: `Photo ${p.ordinal}${p.photo_kind ? ` (${p.photo_kind})` : ""}`,
      text: p.full_text,
      details: [
        p.origin === "user" ? "Transcription corrected by the listener" : `Transcription confidence: ${p.overall_confidence ?? "unknown"}`,
        p.legibility_note ? `Legibility: ${p.legibility_note}` : null,
        p.sermon_timestamp_seconds !== null ? `Taken at ${formatTimestamp(p.sermon_timestamp_seconds)} in the sermon` : null,
      ].filter((d): d is string => Boolean(d)),
    },
    {
      sourceId: p.source_id,
      sourceType: "PHOTO",
      noteBlockId: null,
      noteBlockIds: [],
      timestampStart: p.sermon_timestamp_seconds,
      timestampEnd: null,
      timestampSource: p.sermon_timestamp_seconds !== null ? "user_capture" : null,
      page: null,
      excerpt: excerpt(p.full_text),
      text: p.full_text,
      confidence: p.origin === "user" ? "high" : p.overall_confidence,
      verbatimPhrases: [p.full_text],
    },
  ];
}

export async function buildCatalog(sql: Sql, sermonId: string): Promise<SermonCatalog | null> {
  const sermon = await loadSermon(sql, sermonId);
  if (!sermon) return null;

  const units: CatalogUnit[] = [];
  const refs = new Map<string, EvidenceRef>();
  const hashParts: string[] = [];
  const add = (unit: CatalogUnit, ref: Omit<EvidenceRef, "key" | "kind" | "label">) => {
    units.push(unit);
    refs.set(unit.key, { ...ref, key: unit.key, kind: unit.kind, label: unit.label });
  };

  // --- Recording segments ---------------------------------------------------
  const recording = await loadCurrentRecording(sql, sermonId);
  let recordingNote: string | null = null;
  let segmentCount = 0;
  if (recording) {
    const analysis = recording.structured_content;
    recordingNote = analysis.content_note;
    hashParts.push(`rec:${recording.artifact_id}`);
    const built = recordingUnits(analysis, recording);
    for (const [unit, ref] of built) add(unit, ref);
    segmentCount = built.length;
  }

  // --- Notes ----------------------------------------------------------------
  const blocks = await sql<
    { note_id: string; source_id: string; block_id: string; text: string; timestamp_seconds: number | null; content_hash: string | null }[]
  >`
    select b.note_id, n.source_id, b.block_id, b.text, b.timestamp_seconds, n.content_hash
    from public.note_blocks b
    join public.notes n on n.id = b.note_id
    where b.sermon_id = ${sermonId}
    order by n.created_at, b.position`;
  const noteHashes = new Set(blocks.map((b) => `${b.note_id}:${b.content_hash ?? ""}`));
  hashParts.push(...noteHashes);
  const groupSize = Math.max(1, Math.ceil(blocks.length / MAX_NOTE_UNITS));
  let noteIndex = 0;
  for (let i = 0; i < blocks.length; ) {
    const first = blocks[i]!;
    const group = [first];
    let j = i + 1;
    while (j < blocks.length && group.length < groupSize && blocks[j]!.note_id === first.note_id) group.push(blocks[j++]!);
    i = j;
    const [unit, ref] = noteUnit(`N${++noteIndex}`, group);
    add(unit, ref);
  }

  // --- Photos (current OCR) -------------------------------------------------
  const photos = await sql<
    {
      source_id: string;
      ordinal: number;
      ocr_id: string | null;
      photo_kind: string | null;
      title: string | null;
      full_text: string | null;
      overall_confidence: Confidence | null;
      legibility_note: string | null;
      origin: Enums<"item_origin"> | null;
      sermon_timestamp_seconds: number | null;
      status: Enums<"source_status">;
    }[]
  >`
    select p.source_id, s.ordinal, o.id as ocr_id, o.photo_kind, o.title, o.full_text, o.overall_confidence,
           o.legibility_note, o.origin, p.sermon_timestamp_seconds, s.status
    from public.photos p
    join public.sermon_sources s on s.id = p.source_id
    left join public.ocr_extractions o on o.id = p.current_ocr_id
    where p.sermon_id = ${sermonId}
    order by s.ordinal`;
  let photoCount = 0;
  for (const p of photos) {
    hashParts.push(`photo:${p.source_id}:${p.ocr_id ?? "none"}`);
    if (!p.full_text?.trim()) continue;
    photoCount++;
    const [unit, ref] = photoUnit({ ...p, full_text: p.full_text });
    add(unit, ref);
  }

  // --- Documents ------------------------------------------------------------
  const docs = await sql<{ source_id: string; ordinal: number; title: string | null; pages: { page: number; text: string }[]; content_hash: string | null }[]>`
    select d.source_id, s.ordinal, d.title, d.pages, s.content_hash
    from public.documents d join public.sermon_sources s on s.id = d.source_id
    where d.sermon_id = ${sermonId} and s.status = 'processed'
    order by s.ordinal`;
  let documentCount = 0;
  for (const d of docs) {
    hashParts.push(`doc:${d.source_id}:${d.content_hash ?? ""}`);
    for (const page of d.pages ?? []) {
      if (!page.text?.trim()) continue;
      documentCount++;
      const key = `D${d.ordinal}.p${page.page}`;
      add(
        { key, kind: "document", label: `${d.title || `Document ${d.ordinal}`}, page ${page.page}`, text: page.text.slice(0, 6000) },
        {
          sourceId: d.source_id,
          sourceType: "DOCUMENT",
          noteBlockId: null,
          noteBlockIds: [],
          timestampStart: null,
          timestampEnd: null,
          timestampSource: null,
          page: page.page,
          excerpt: excerpt(page.text),
          text: page.text,
          confidence: "high",
          verbatimPhrases: [page.text],
        },
      );
    }
  }

  // --- User captures --------------------------------------------------------
  const captures = await sql<
    { id: string; kind: string; text: string; timestamp_start: number | null; source_id: string | null; updated_at: Date }[]
  >`
    select m.id, m.category::text as kind, trim(both from m.title || ' ' || m.description) as text,
           m.timestamp_start, null::uuid as source_id, m.updated_at
    from public.sermon_moments m
    where m.sermon_id = ${sermonId} and m.origin = 'user' and not m.hidden
    union all
    select q.id, 'QUESTION', q.text, q.timestamp_seconds, null::uuid, q.updated_at
    from public.questions q
    where q.sermon_id = ${sermonId} and q.origin = 'user' and not q.hidden and q.moment_id is null
    order by 4 nulls last`;
  // Captures are cited through the notebook's primary note source when one exists.
  const [noteSource] = await sql<{ id: string }[]>`
    select id from public.sermon_sources where sermon_id = ${sermonId} and source_type = 'USER_NOTE' order by ordinal limit 1`;
  let captureIndex = 0;
  for (const c of captures) {
    hashParts.push(`cap:${c.id}:${c.updated_at.toISOString()}`);
    if (!noteSource) continue;
    const key = `C${++captureIndex}`;
    const what = c.kind === "QUESTION" ? "Question you marked" : c.kind === "IMPORTANT" ? "Moment you marked important" : "Moment you bookmarked";
    const label = c.timestamp_start !== null ? `${what} at ${formatTimestamp(c.timestamp_start)}` : what;
    add(
      { key, kind: "capture", label, text: c.text || "(no text)" },
      {
        sourceId: noteSource.id,
        sourceType: "USER_NOTE",
        noteBlockId: null,
        noteBlockIds: [],
        timestampStart: c.timestamp_start,
        timestampEnd: null,
        timestampSource: c.timestamp_start !== null ? "user_capture" : null,
        page: null,
        excerpt: excerpt(c.text || label),
        text: c.text,
        confidence: "high",
        verbatimPhrases: c.text ? [c.text] : [],
      },
    );
  }

  return {
    sermon,
    units,
    refs,
    hasRecording: Boolean(recording),
    recording: recording
      ? { sourceId: recording.source_id, sourceType: recording.source_type, durationSeconds: recording.duration_seconds, artifactId: recording.artifact_id }
      : null,
    recordingNote,
    sourceVersionHash: combineHashes(hashParts),
    counts: { segments: segmentCount, notes: noteIndex, photos: photoCount, documents: documentCount, captures: captureIndex },
  };
}
