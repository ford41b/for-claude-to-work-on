import { enforceRateLimit } from "@/lib/auth/session";
import { serviceContext } from "@/lib/http/context";
import { readJson, route, uuidParam } from "@/lib/http/route";
import { askErrorMessage, askQuestion, askSchema, type AskEvent } from "@/lib/retrieval/ask";
import { errorFields, log } from "@/lib/observability/log";

export const maxDuration = 120;

/**
 * Ask AI. Streams newline-delimited JSON events so the UI can show real stages
 * (understanding → searching → answering) and then the cited answer.
 */
export const POST = route<{ params: Promise<{ id: string }> }>("ask", async (req, { params }) => {
  const id = uuidParam.parse((await params).id);
  const ctx = await serviceContext();
  const input = await readJson(req, askSchema);
  await enforceRateLimit(ctx.supabase, "ask");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        const result = await askQuestion(ctx, id, input, send, req.signal);
        send({ type: "answer", data: result });
      } catch (err) {
        const { code, message } = askErrorMessage(err);
        if (code === "internal") log.error("ask.failed", { sermon_id: id, ...errorFields(err) });
        send({ type: "error", code, message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
