import type { Sql } from "@/lib/db/admin";

/**
 * Metadata precedence: what the user typed or corrected (sermons.corrected_fields) always wins;
 * provider metadata (YouTube) fills empty fields; AI suggestions fill what is still empty when
 * the pack is built. Suggestions are also stored so the UI can offer them.
 */
export async function applyProviderMetadata(
  sql: Sql,
  sermonId: string,
  meta: { title: string | null; church: string | null; preachedOn: string | null },
) {
  const suggestions: Record<string, { value: string; source: string; confidence: string }> = {};
  if (meta.title) suggestions.title = { value: meta.title.slice(0, 300), source: "youtube", confidence: "medium" };
  if (meta.church) suggestions.church = { value: meta.church.slice(0, 200), source: "youtube", confidence: "low" };
  if (meta.preachedOn) suggestions.preached_on = { value: meta.preachedOn, source: "youtube", confidence: "low" };
  await sql`
    update public.sermons
       set metadata_suggestions = metadata_suggestions || ${sql.json(suggestions as never)},
           title = case when title = '' and not ('title' = any(corrected_fields)) and ${meta.title}::text is not null
                        then left(${meta.title}, 300) else title end,
           church = case when church is null and not ('church' = any(corrected_fields)) then left(${meta.church}, 200) else church end,
           preached_on = case when preached_on is null and not ('preached_on' = any(corrected_fields)) and ${meta.preachedOn}::text is not null
                        then ${meta.preachedOn}::date else preached_on end
     where id = ${sermonId}`;
}
