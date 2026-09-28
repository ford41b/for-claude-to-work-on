import { z } from "zod";
import { STUDY_FORMATS } from "@/lib/ai/prompts/study";
import { isAIConfigured } from "@/lib/ai/registry";
import { AppError } from "@/lib/http/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { assertOwnsSermon, type ServiceContext } from "@/lib/sermons/service";

export const requestStudySchema = z.object({ format: z.enum(STUDY_FORMATS) });

/** Creates a study guide row in "generating" state and queues GENERATE_STUDY. */
export async function requestStudy(ctx: ServiceContext, sermonId: string, input: z.infer<typeof requestStudySchema>) {
  await assertOwnsSermon(ctx, sermonId);
  if (!isAIConfigured()) throw new AppError("ai_not_configured", "Bible study generation needs AI processing, which isn't set up.");
  const { data: sermon } = await ctx.supabase.from("sermons").select("current_pack_id").eq("id", sermonId).single();
  if (!sermon?.current_pack_id) {
    throw new AppError("conflict", "The Sermon Pack isn't ready yet. Finish the sermon and wait for processing to complete.");
  }
  const [row] = await ctx.sql<{ id: string }[]>`
    insert into public.study_guides (sermon_id, user_id, format, status)
    values (${sermonId}, ${ctx.userId}, ${input.format}, 'generating')
    returning id`;
  await enqueueJob(ctx.sql, {
    userId: ctx.userId,
    sermonId,
    type: "GENERATE_STUDY",
    payload: { studyGuideId: row!.id, format: input.format },
    dedupeKey: `study:${row!.id}`,
  });
  return { id: row!.id };
}
