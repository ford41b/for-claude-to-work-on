import { z } from "zod";
import { notFound } from "@/lib/http/errors";
import type { ServiceContext } from "@/lib/sermons/service";
import type { TableUpdate } from "@/lib/supabase/types";

export const reviewActionSchema = z.object({ status: z.enum(["reviewed", "saved", "review_again", "hidden", "new"]) });

/** Review actions: Reviewed · Save · Review again · Hide. No scores, no streaks. */
export async function updateReviewItem(ctx: ServiceContext, id: string, input: z.infer<typeof reviewActionSchema>) {
  const { data: item, error } = await ctx.supabase.from("review_items").select("id, times_reviewed").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!item) throw notFound("That review item");
  const reviewed = input.status === "reviewed" || input.status === "review_again";
  const dueOn = input.status === "review_again" ? new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) : null;
  const { error: upErr } = await ctx.supabase
    .from("review_items")
    .update({
      status: input.status,
      due_on: dueOn,
      ...(reviewed ? { last_reviewed_at: new Date().toISOString(), times_reviewed: item.times_reviewed + 1 } : {}),
    })
    .eq("id", id);
  if (upErr) throw upErr;
}

export const applicationUpdateSchema = z.object({
  status: z.enum(["open", "completed", "archived"]).optional(),
  text: z.string().trim().min(1).max(1000).optional(),
  hidden: z.boolean().optional(),
});

export async function updateApplication(ctx: ServiceContext, id: string, input: z.infer<typeof applicationUpdateSchema>) {
  const patch: TableUpdate<"applications"> = {};
  if (input.status) {
    patch.status = input.status;
    patch.completed_at = input.status === "completed" ? new Date().toISOString() : null;
  }
  if (input.text !== undefined) {
    patch.text = input.text;
    patch.user_edited = true;
  }
  if (input.hidden !== undefined) {
    patch.hidden = input.hidden;
    patch.user_edited = true;
  }
  const { data, error } = await ctx.supabase.from("applications").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("That application");
}

export const questionUpdateSchema = z.object({
  status: z.enum(["open", "answered"]).optional(),
  answer: z.string().trim().max(10000).nullable().optional(),
  forGroup: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export async function updateQuestion(ctx: ServiceContext, id: string, input: z.infer<typeof questionUpdateSchema>) {
  const patch: TableUpdate<"questions"> = {};
  if (input.status) {
    patch.status = input.status;
    patch.answered_at = input.status === "answered" ? new Date().toISOString() : null;
  }
  if (input.answer !== undefined) patch.answer = input.answer;
  if (input.forGroup !== undefined) patch.for_group = input.forGroup;
  if (input.hidden !== undefined) {
    patch.hidden = input.hidden;
    patch.user_edited = true;
  }
  const { data, error } = await ctx.supabase.from("questions").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw notFound("That question");
}
