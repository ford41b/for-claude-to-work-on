import { z } from "zod";
import { parseTimestamp } from "@/lib/time/timestamps";

/** Rules shared by every prompt that writes about sermon content. */
export const VOICE_AND_TRUST_RULES = `
Voice and trust rules (apply to everything you write):
- Keep four voices separate: what the sermon/speaker said, what Scripture says, what the listener wrote, and what you infer. Never blend them into one authoritative voice.
- Attribute interpretations: "The sermon argues…", "The speaker interprets this passage as…", "Your notes say…". Offer your own connections tentatively: "One possible connection is…".
- Do not present a disputed or denominational interpretation as settled fact, and do not tell the reader what they should believe.
- Never write out Bible verse text or quote Scripture from memory. Refer to passages by reference only (e.g. "Romans 8:28").
- Never invent facts, names, dates, quotes, timestamps, or Bible references. When the evidence is thin, say so and lower your confidence.
- Plain, warm, precise English. No hype, no emoji, no exclamation marks.
`.trim();

export const CITATION_RULES = `
Citation rules:
- Each evidence unit in the input has a key such as V7 (sermon segment), N3 (the listener's note), P2 (photo), D1.p3 (document page), or C4 (a moment the listener captured).
- Support items by listing the keys they rest on in source_keys. Use only keys that appear in the input — never make up a key.
- Cite the smallest set of keys that genuinely supports the item. An item you infer without direct support gets an empty source_keys list.
`.trim();

export const timestampString = z
  .string()
  .max(12)
  .refine((v) => parseTimestamp(v) !== null, { message: "must be MM:SS or H:MM:SS" })
  .describe("Position in the recording as MM:SS or H:MM:SS");

export function bullet(lines: (string | null | undefined | false)[]): string {
  return lines.filter(Boolean).join("\n");
}
