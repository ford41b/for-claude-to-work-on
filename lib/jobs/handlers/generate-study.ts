import { estimateCostUsd } from "@/lib/ai/pricing";
import { STUDY_FORMATS, type StudyFormat } from "@/lib/ai/prompts/study";
import { sermonAI } from "@/lib/ai/service";
import { buildCatalog } from "@/lib/sources/catalog";
import { PermanentJobError, type JobHandler } from "../context";

/**
 * GENERATE_STUDY: builds a Bible study from the current Sermon Pack. Section citations resolve
 * against the same source catalog as the pack; unknown keys are dropped.
 */
export const generateStudy: JobHandler = async ({ job, sql, signal, progress }) => {
  const studyId = String(job.payload.studyGuideId ?? "");
  const format = String(job.payload.format ?? "") as StudyFormat;
  if (!job.sermon_id || !studyId || !STUDY_FORMATS.includes(format)) throw new PermanentJobError("bad_job", "Invalid study request.");

  const [sermon] = await sql<{ title: string; speaker: string | null; big_idea: string | null; current_pack_id: string | null }[]>`
    select title, speaker, big_idea, current_pack_id from public.sermons where id = ${job.sermon_id}`;
  if (!sermon) throw new PermanentJobError("not_found", "This sermon no longer exists.");
  if (!sermon.current_pack_id) {
    throw new PermanentJobError("no_pack", "Finish the sermon and let the Sermon Pack build before creating a study.");
  }

  await progress("Reading your Sermon Pack", 15);
  const catalog = await buildCatalog(sql, job.sermon_id);
  if (!catalog) throw new PermanentJobError("not_found", "This sermon no longer exists.");

  const mainIdeas = await sql<{ id: string; title: string; summary: string }[]>`
    select id, title, summary from public.main_ideas where sermon_id = ${job.sermon_id} and not hidden order by position limit 7`;
  const scriptures = await sql<{ normalized_reference: string; role: string; sermon_context: string }[]>`
    select normalized_reference, role, sermon_context from public.scripture_references
    where sermon_id = ${job.sermon_id} and not hidden order by position limit 12`;
  const applications = await sql<{ text: string }[]>`
    select text from public.applications where sermon_id = ${job.sermon_id} and not hidden order by position limit 6`;
  // Evidence: units cited by main ideas first, then the rest, capped for prompt size.
  const cited = await sql<{ source_key: string | null }[]>`
    select distinct source_key from public.source_citations
    where subject_type = 'main_idea' and subject_id in ${sql(mainIdeas.length ? mainIdeas.map((m) => m.id) : ["00000000-0000-0000-0000-000000000000"])}`;
  const priority = new Set(cited.map((c) => c.source_key).filter(Boolean));
  const units = [...catalog.units.filter((u) => priority.has(u.key)), ...catalog.units.filter((u) => !priority.has(u.key))].slice(0, 30);

  await progress("Writing your study", 40);
  const run = await sermonAI.generateStudy(
    {
      format,
      sermon: { title: sermon.title || null, speaker: sermon.speaker },
      bigIdea: sermon.big_idea,
      mainIdeas: mainIdeas.map((m) => ({ title: m.title, summary: m.summary })),
      scriptures: scriptures.map((s) => ({ reference: s.normalized_reference, role: s.role, context: s.sermon_context })),
      applications: applications.map((a) => a.text),
      units,
    },
    signal,
  );

  const allowed = new Set(units.map((u) => u.key));
  let dropped = 0;
  const sections = run.output.sections.map((s) => {
    const keys = s.source_keys.map((k) => k.trim()).filter((k) => {
      const ok = allowed.has(k) && catalog.refs.has(k);
      if (!ok) dropped++;
      return ok;
    });
    return { ...s, source_keys: [...new Set(keys)] };
  });
  const cost = estimateCostUsd(run.model, run.usage);

  await sql.begin(async (tx) => {
    const [artifact] = await tx<{ id: string }[]>`
      insert into public.ai_artifacts (sermon_id, user_id, type, status, provider, model, prompt_version, structured_content, input_source_ids, usage)
      values (${job.sermon_id}, ${job.user_id}, 'BIBLE_STUDY', 'ready', ${run.provider}, ${run.model}, ${run.promptVersion},
              ${tx.json({ ...run.output, sections, citation_drops: dropped } as never)},
              ${[...new Set(units.map((u) => catalog.refs.get(u.key)!.sourceId))]},
              ${tx.json({ ...run.usage, estimated_cost_usd: cost } as never)})
      returning id`;
    await tx`
      update public.study_guides
         set status = 'ready', artifact_id = ${artifact!.id}, title = ${run.output.title},
             content = ${tx.json({ big_idea: run.output.big_idea, primary_scripture: run.output.primary_scripture, estimated_minutes: run.output.estimated_minutes, sections } as never)},
             error_message = null
       where id = ${studyId} and sermon_id = ${job.sermon_id}`;
    await tx`delete from public.source_citations where subject_type = 'study_guide' and subject_id = ${studyId}`;
    const rows = sections.flatMap((s) =>
      s.source_keys.map((key, i) => {
        const ref = catalog.refs.get(key)!;
        return {
          sermon_id: job.sermon_id!,
          user_id: job.user_id,
          subject_type: "study_guide",
          subject_id: studyId,
          subject_part: s.key,
          source_id: ref.sourceId,
          source_key: key,
          note_block_id: ref.noteBlockId,
          timestamp_start: ref.timestampStart,
          timestamp_end: ref.timestampEnd,
          page: ref.page,
          excerpt: ref.excerpt,
          confidence: ref.confidence,
          position: i,
        };
      }),
    );
    if (rows.length) await tx`insert into public.source_citations ${tx(rows)}`;
  });

  return {
    result: { study_guide_id: studyId, sections: sections.length, citation_drops: dropped },
    usage: { ...run.usage, estimatedCostUsd: cost },
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
  };
};
