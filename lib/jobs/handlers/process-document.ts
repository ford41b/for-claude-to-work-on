import { UPLOAD_LIMITS } from "@/lib/config/app";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { documentAnalysisPrompt } from "@/lib/ai/prompts/document-analysis";
import { getModelProvider, isAIConfigured } from "@/lib/ai/registry";
import { sermonAI } from "@/lib/ai/service";
import { hashJson } from "@/lib/hash";
import { downloadBytes, type Bucket } from "@/lib/storage/objects";
import { PermanentJobError, type JobHandler } from "../context";
import { maybeScheduleSynthesis, scheduleEmbeddings } from "../pipeline";

const PAGE_CHARS = 3000;

/** Splits plain text into pseudo-pages on paragraph boundaries. */
export function paginateText(text: string): { page: number; text: string; headings: string[] }[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const pages: { page: number; text: string; headings: string[] }[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) pages.push({ page: pages.length + 1, text: current.trim(), headings: [] });
    current = "";
  };
  for (const p of paragraphs) {
    if (current.length + p.length > PAGE_CHARS && current) flush();
    if (p.length > PAGE_CHARS) {
      for (let i = 0; i < p.length; i += PAGE_CHARS) {
        current = p.slice(i, i + PAGE_CHARS);
        flush();
      }
      continue;
    }
    current += `${current ? "\n\n" : ""}${p}`;
  }
  flush();
  for (const page of pages) {
    page.headings = page.text
      .split("\n")
      .filter((l) => /^#{1,6}\s/.test(l))
      .map((l) => l.replace(/^#+\s*/, "").slice(0, 200));
  }
  return pages.slice(0, 200);
}

/** PROCESS_DOCUMENT: text files are paginated directly (no AI); PDFs use document understanding. */
export const processDocument: JobHandler = async ({ job, sql, signal, progress }) => {
  if (!job.source_id || !job.sermon_id) throw new PermanentJobError("bad_job", "Missing source.");
  const [doc] = await sql<{ bucket: Bucket; path: string; mime_type: string; sha256: string | null; original_filename: string | null }[]>`
    select m.bucket, m.path, m.mime_type, m.sha256, m.original_filename
    from public.documents d join public.media_files m on m.id = d.media_file_id
    where d.source_id = ${job.source_id} and m.status = 'verified'`;
  if (!doc) throw new PermanentJobError("not_found", "This document is missing or hasn't finished uploading.");

  await sql`update public.sermon_sources set status = 'processing', error_code = null, error_message = null where id = ${job.source_id}`;
  await progress("Reading the document", 20);
  const bytes = await downloadBytes(doc.bucket, doc.path, UPLOAD_LIMITS.document);
  const title = doc.original_filename?.replace(/\.[a-z0-9]+$/i, "") ?? null;

  let pages: { page: number; text: string; headings: string[] }[];
  let meta: Record<string, unknown> = {};
  if (doc.mime_type === "text/plain" || doc.mime_type === "text/markdown") {
    pages = paginateText(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  } else {
    if (!isAIConfigured()) {
      await sql`
        update public.sermon_sources
           set status = 'ready', error_code = 'ai_not_configured',
               error_message = 'Document saved. Reading PDFs needs AI processing, which is unavailable.'
         where id = ${job.source_id}`;
      await maybeScheduleSynthesis(sql, job.sermon_id);
      return { result: { skipped: "ai_not_configured" } };
    }
    const provider = getModelProvider();
    const model = provider.modelFor(documentAnalysisPrompt.tier);
    const inputHash = hashJson({ sha256: doc.sha256 ?? doc.path, prompt: documentAnalysisPrompt.version, model, provider: provider.id });
    const run = await sermonAI.analyzeDocument({ document: { mimeType: doc.mime_type, data: bytes } }, signal);
    pages = run.output.pages.map((p) => ({ page: p.page, text: p.text, headings: p.headings }));
    const cost = estimateCostUsd(run.model, run.usage);
    await sql`
      insert into public.ai_artifacts (sermon_id, user_id, source_id, type, status, input_hash, provider, model, prompt_version,
                                       structured_content, input_source_ids, usage)
      values (${job.sermon_id}, ${job.user_id}, ${job.source_id}, 'DOCUMENT_ANALYSIS', 'ready', ${inputHash}, ${run.provider}, ${run.model},
              ${run.promptVersion}, ${sql.json(run.output as never)}, ${[job.source_id!]},
              ${sql.json({ ...run.usage, estimated_cost_usd: cost } as never)})`;
    meta = { usage: { ...run.usage, estimatedCostUsd: cost }, provider: run.provider, model: run.model, promptVersion: run.promptVersion };
  }

  const extracted = pages.map((p) => p.text).join("\n\n");
  await sql`
    update public.documents
       set pages = ${sql.json(pages as never)}, extracted_text = ${extracted.slice(0, 500_000)}, page_count = ${pages.length},
           title = coalesce(title, ${title})
     where source_id = ${job.source_id}`;
  await sql`
    update public.sermon_sources
       set status = 'processed', processed_at = now(), content_hash = ${doc.sha256},
           error_code = ${pages.length ? null : "no_text"}, error_message = ${pages.length ? null : "No readable text was found."}
     where id = ${job.source_id}`;
  await maybeScheduleSynthesis(sql, job.sermon_id);
  await scheduleEmbeddings(sql, job.user_id, job.sermon_id, 15);
  return { result: { pages: pages.length }, ...(meta as object) };
};
