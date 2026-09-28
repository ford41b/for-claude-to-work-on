import type { Sql, SqlLike } from "@/lib/db/admin";
import type { TokenUsage } from "@/lib/ai/types";
import type { SermonRowLite } from "@/lib/sources/catalog";
import type { PackPlan, Planned, ResolvedCitation, ScriptureDetection } from "./resolve";

/**
 * Persists a resolved Sermon Pack in one transaction:
 *  - inserts a new, versioned SERMON_PACK artifact and supersedes the previous one
 *  - replaces AI-generated items that the user has not touched
 *  - keeps every user-edited, hidden, or user-created item (and skips new AI duplicates of them)
 *  - rewrites citations for replaced items
 *  - updates denormalized sermon fields; metadata only for fields the user never set
 */

type Tx = SqlLike;

export interface PersistPackInput {
  sermon: SermonRowLite;
  plan: PackPlan;
  structuredContent: Record<string, unknown>;
  sourceVersionHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  usage: TokenUsage;
  inputSourceIds: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function insertCitations(
  tx: Tx,
  sermon: SermonRowLite,
  subjectType: string,
  subjectId: string,
  citations: (ResolvedCitation & { part?: string })[],
) {
  if (!citations.length) return;
  const rows = citations.map((c, i) => ({
    sermon_id: sermon.id,
    user_id: sermon.user_id,
    subject_type: subjectType,
    subject_id: subjectId,
    subject_part: c.part ?? null,
    source_id: c.sourceId,
    source_key: c.sourceKey,
    note_block_id: c.noteBlockId,
    timestamp_start: c.timestampStart,
    timestamp_end: c.timestampEnd,
    page: c.page,
    excerpt: c.excerpt.slice(0, 600),
    confidence: c.confidence,
    position: i,
  }));
  await tx`insert into public.source_citations ${tx(rows)}`;
}

/** Deletes replaceable AI rows of a table and their citations; returns normalized keys of rows kept. */
async function clearReplaceable(
  tx: Tx,
  table: string,
  subjectType: string,
  sermonId: string,
  keepCondition: string,
  keyColumn: string,
): Promise<Set<string>> {
  const deleted = await tx.unsafe<{ id: string }[]>(
    `delete from public.${table} where sermon_id = $1 and origin = 'ai' and not (${keepCondition}) returning id`,
    [sermonId],
  );
  if (deleted.length) {
    await tx`delete from public.source_citations where subject_type = ${subjectType} and subject_id in ${tx(deleted.map((d) => d.id))}`;
  }
  const kept = await tx.unsafe<{ k: string }[]>(`select ${keyColumn} as k from public.${table} where sermon_id = $1`, [sermonId]);
  return new Set(kept.map((r) => norm(r.k ?? "")));
}

async function insertItems<T extends object>(
  tx: Tx,
  sermon: SermonRowLite,
  packId: string,
  table: string,
  subjectType: string,
  items: Planned<T>[],
  keyOf: (fields: T) => string,
  kept: Set<string>,
): Promise<number> {
  let position = 0;
  let inserted = 0;
  for (const item of items) {
    if (kept.has(norm(keyOf(item.fields)))) continue;
    const row = { ...item.fields, sermon_id: sermon.id, user_id: sermon.user_id, pack_artifact_id: packId, origin: "ai", position: position++ };
    const [created] = await tx<{ id: string }[]>`insert into public.${tx(table)} ${tx(row as Record<string, unknown>)} returning id`;
    await insertCitations(tx, sermon, subjectType, created!.id, item.citations);
    inserted++;
  }
  return inserted;
}

export async function persistPack(sql: Sql, input: PersistPackInput): Promise<{ packId: string; version: number }> {
  const { sermon, plan } = input;
  return sql.begin(async (tx) => {
    // Serialize concurrent pack writes for this sermon.
    await tx`select 1 from public.sermons where id = ${sermon.id} for update`;
    const [versionRow] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0) + 1 as next from public.ai_artifacts
      where sermon_id = ${sermon.id} and type = 'SERMON_PACK'`;
    const next = versionRow!.next;

    const [pack] = await tx<{ id: string }[]>`
      insert into public.ai_artifacts (sermon_id, user_id, type, status, version, source_version_hash, provider, model,
                                       prompt_version, structured_content, input_source_ids, usage)
      values (${sermon.id}, ${sermon.user_id}, 'SERMON_PACK', 'ready', ${next}, ${input.sourceVersionHash}, ${input.provider},
              ${input.model}, ${input.promptVersion}, ${tx.json(input.structuredContent as never)},
              ${input.inputSourceIds}, ${tx.json(input.usage as never)})
      returning id`;
    const packId = pack!.id;
    await tx`
      update public.ai_artifacts set status = 'superseded'
      where sermon_id = ${sermon.id} and type = 'SERMON_PACK' and id <> ${packId} and status = 'ready'`;

    const keepEdited = "user_edited or hidden";
    const counts: Record<string, number> = {};

    let kept = await clearReplaceable(tx, "main_ideas", "main_idea", sermon.id, keepEdited, "title");
    counts.main_ideas = await insertItems(tx, sermon, packId, "main_ideas", "main_idea", plan.mainIdeas, (f) => f.title, kept);

    kept = await clearReplaceable(tx, "sermon_sections", "section", sermon.id, keepEdited, "title");
    counts.sections = await insertItems(tx, sermon, packId, "sermon_sections", "section", plan.sections, (f) => f.title, kept);

    kept = await clearReplaceable(tx, "sermon_moments", "moment", sermon.id, keepEdited, "title");
    counts.moments = await insertItems(
      tx,
      sermon,
      packId,
      "sermon_moments",
      "moment",
      plan.moments.map((m) => ({ ...m, fields: { ...m.fields, timestamp_source: "ai", verification_status: "unverified" } })),
      (f) => f.title,
      kept,
    );

    kept = await clearReplaceable(tx, "scripture_references", "scripture", sermon.id, keepEdited, "osis");
    counts.scriptures = await insertItems(tx, sermon, packId, "scripture_references", "scripture", plan.scriptures, (f) => f.osis, kept);

    kept = await clearReplaceable(tx, "quotes", "quote", sermon.id, keepEdited, "text");
    counts.quotes = await insertItems(tx, sermon, packId, "quotes", "quote", plan.quotes, (f) => f.text, kept);

    kept = await clearReplaceable(tx, "illustrations", "illustration", sermon.id, keepEdited, "title");
    counts.illustrations = await insertItems(tx, sermon, packId, "illustrations", "illustration", plan.illustrations, (f) => f.title, kept);

    kept = await clearReplaceable(tx, "applications", "application", sermon.id, `${keepEdited} or status <> 'open'`, "text");
    counts.applications = await insertItems(tx, sermon, packId, "applications", "application", plan.applications, (f) => f.text, kept);

    kept = await clearReplaceable(tx, "questions", "question", sermon.id, `${keepEdited} or status <> 'open' or answer is not null`, "text");
    counts.questions = await insertItems(tx, sermon, packId, "questions", "question", plan.questions, (f) => f.text, kept);

    kept = await clearReplaceable(tx, "terms", "term", sermon.id, keepEdited, "term");
    counts.terms = await insertItems(tx, sermon, packId, "terms", "term", plan.terms, (f) => f.term, kept);

    // Review items the user has acted on (reviewed/saved/review again/hidden) are kept.
    kept = await clearReplaceable(tx, "review_items", "review_item", sermon.id, "status <> 'new'", "prompt");
    counts.review_items = await insertItems(tx, sermon, packId, "review_items", "review_item", plan.reviewItems, (f) => f.prompt, kept);

    // Sermon-level citations (big idea, summaries).
    await tx`delete from public.source_citations where subject_type = 'sermon' and subject_id = ${sermon.id}`;
    await insertCitations(tx, sermon, "sermon", sermon.id, plan.sermonCitations);

    // Metadata: fill only fields the user never set and that are still empty.
    const suggestions: Record<string, { value: string; confidence: string; source: string }> = {};
    const updates: Record<string, string> = {};
    const [current] = await tx<{ title: string; speaker: string | null; church: string | null; series: string | null; preached_on: string | null }[]>`
      select title, speaker, church, series, preached_on::text from public.sermons where id = ${sermon.id}`;
    for (const m of plan.metadata) {
      suggestions[m.field] = { value: m.value, confidence: m.confidence, source: "ai" };
      if (sermon.corrected_fields.includes(m.field)) continue;
      const existing = current?.[m.field as keyof typeof current];
      if (existing && String(existing).trim()) continue;
      updates[m.field] = m.value;
    }

    await tx`
      update public.sermons
         set big_idea = ${plan.sermon.big_idea},
             central_thesis = ${plan.sermon.central_thesis},
             short_summary = ${plan.sermon.short_summary},
             detailed_summary = ${plan.sermon.detailed_summary},
             current_pack_id = ${packId},
             pack_stale = false,
             metadata_suggestions = metadata_suggestions || ${tx.json(suggestions as never)},
             title = case when ${updates.title ?? null}::text is not null then ${updates.title ?? null} else title end,
             speaker = coalesce(${updates.speaker ?? null}, speaker),
             church = coalesce(${updates.church ?? null}, church),
             series = coalesce(${updates.series ?? null}, series),
             preached_on = coalesce(${updates.preached_on ?? null}::date, preached_on)
       where id = ${sermon.id}`;

    await tx`
      update public.ai_artifacts
         set structured_content = structured_content || ${tx.json({ persisted_counts: counts } as never)}
       where id = ${packId}`;

    return { packId, version: next };
  });
}

/**
 * Replaces system-detected Scripture (not yet enriched by a pack) with fresh detections.
 * User-created, user-edited, and hidden rows are untouched.
 */
export async function persistScriptureDetections(sql: Sql, sermon: SermonRowLite, detections: ScriptureDetection[]) {
  await sql.begin(async (tx) => {
    await tx`select 1 from public.sermons where id = ${sermon.id} for update`;
    const deleted = await tx<{ id: string }[]>`
      delete from public.scripture_references
      where sermon_id = ${sermon.id} and origin = 'ai' and not user_edited and not hidden
      returning id`;
    if (deleted.length) {
      await tx`delete from public.source_citations where subject_type = 'scripture' and subject_id in ${tx(deleted.map((d) => d.id))}`;
    }
    const kept = new Set(
      (await tx<{ osis: string }[]>`select osis from public.scripture_references where sermon_id = ${sermon.id}`).map((r) => r.osis),
    );
    let position = 0;
    for (const d of detections) {
      if (kept.has(d.osis)) continue;
      const first = d.citations.filter((c) => c.timestampStart !== null).sort((a, b) => a.timestampStart! - b.timestampStart!)[0];
      const [row] = await tx<{ id: string }[]>`
        insert into public.scripture_references (sermon_id, user_id, origin, position, reference_text, normalized_reference, osis, book,
          chapter_start, verse_start, chapter_end, verse_end, kind, confidence, role, timestamp_start, timestamp_confidence)
        values (${sermon.id}, ${sermon.user_id}, 'ai', ${position++}, ${d.referenceText}, ${d.normalized}, ${d.osis}, ${d.book},
          ${d.chapterStart}, ${d.verseStart}, ${d.chapterEnd}, ${d.verseEnd}, ${d.kind}, ${d.confidence}, 'mentioned',
          ${first?.timestampStart ?? null}, ${first ? (first.confidence ?? "medium") : null})
        returning id`;
      await insertCitations(tx, sermon, "scripture", row!.id, d.citations);
    }
  });
}
