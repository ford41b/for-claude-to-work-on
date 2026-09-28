import { AIError } from "@/lib/ai/errors";
import { getModelProvider, isAIConfigured } from "@/lib/ai/registry";
import { sermonAI } from "@/lib/ai/service";
import { buildCatalog } from "@/lib/sources/catalog";
import { chunkCatalog, vectorLiteral } from "@/lib/retrieval/chunk";
import { PermanentJobError, type JobHandler } from "../context";

/**
 * CREATE_EMBEDDINGS: rebuilds retrieval chunks for the notebook and embeds only chunks whose
 * content changed (embeddings are reused by content hash). Chunks are always stored, so
 * full-text retrieval works even when embedding fails or AI is off.
 */
export const createEmbeddings: JobHandler = async ({ job, sql, signal, progress }) => {
  if (!job.sermon_id) throw new PermanentJobError("bad_job", "Missing sermon.");
  const catalog = await buildCatalog(sql, job.sermon_id);
  if (!catalog) throw new PermanentJobError("not_found", "This sermon no longer exists.");
  const chunks = chunkCatalog(catalog);

  const ai = isAIConfigured();
  const model = ai ? getModelProvider().embeddingModel : null;
  const existing = await sql<{ content_hash: string; embedding: string | null; embedding_model: string | null }[]>`
    select content_hash, embedding::text as embedding, embedding_model from public.source_chunks where sermon_id = ${job.sermon_id}`;
  const reusable = new Map(existing.filter((e) => e.embedding && e.embedding_model === model).map((e) => [e.content_hash, e.embedding!]));

  const vectors = new Map<string, string>();
  for (const c of chunks) {
    const hit = reusable.get(c.contentHash);
    if (hit) vectors.set(c.contentHash, hit);
  }
  const toEmbed = ai ? chunks.filter((c) => !vectors.has(c.contentHash)) : [];
  let embedError: AIError | null = null;
  if (toEmbed.length) {
    await progress("Preparing AI search", 40);
    try {
      const res = await sermonAI.embed(toEmbed.map((c) => `${c.sectionTitle}\n${c.text}`), "document", signal);
      toEmbed.forEach((c, i) => {
        const v = res.vectors[i];
        if (v) vectors.set(c.contentHash, vectorLiteral(v));
      });
    } catch (err) {
      embedError = err instanceof AIError ? err : new AIError("unavailable", { detail: String(err) });
    }
  }

  const indexBySource = new Map<string, number>();
  const rows = chunks.map((c) => {
    const idx = indexBySource.get(c.sourceId) ?? 0;
    indexBySource.set(c.sourceId, idx + 1);
    const vector = vectors.get(c.contentHash) ?? null;
    return {
      sermon_id: job.sermon_id!,
      user_id: job.user_id,
      source_id: c.sourceId,
      source_type: c.sourceType,
      chunk_index: idx,
      text: c.text,
      content_hash: c.contentHash,
      timestamp_start: c.timestampStart,
      timestamp_end: c.timestampEnd,
      note_block_ids: c.noteBlockIds,
      page: c.page,
      section_title: c.sectionTitle,
      embedding: vector,
      embedding_model: vector ? model : null,
    };
  });

  await sql.begin(async (tx) => {
    await tx`delete from public.source_chunks where sermon_id = ${job.sermon_id}`;
    for (let i = 0; i < rows.length; i += 200) {
      await tx`insert into public.source_chunks ${tx(rows.slice(i, i + 200))}`;
    }
  });

  if (embedError) throw embedError; // chunks are saved; the retry fills in embeddings
  return { result: { chunks: rows.length, embedded: toEmbed.length, reused: chunks.length - toEmbed.length } };
};
