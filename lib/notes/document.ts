import { z } from "zod";
import { formatTimestamp } from "@/lib/time/timestamps";

/**
 * Notes are stored as ProseMirror/Tiptap JSON. The server never trusts client-derived text:
 * it validates the document shape and derives plain text and citable blocks itself.
 */

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const MAX_DEPTH = 24;

const markSchema = z.object({
  type: z.string().max(40),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

export const pmNodeSchema: z.ZodType<PMNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1).max(40),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(pmNodeSchema).max(10_000).optional(),
    text: z.string().max(100_000).optional(),
    marks: z.array(markSchema).max(20).optional(),
  }),
);

export const pmDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(pmNodeSchema).max(10_000).optional() })
  .refine((doc) => depth(doc as PMNode) <= MAX_DEPTH, { message: "Document is nested too deeply" });

function depth(node: PMNode): number {
  if (!node.content?.length) return 1;
  let max = 0;
  for (const child of node.content) max = Math.max(max, depth(child));
  return max + 1;
}

/** Node types that become citable note blocks (each carries a stable `id` attribute). */
export const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem", "taskItem", "codeBlock"]);

export interface DerivedBlock {
  block_id: string;
  position: number;
  block_type: string;
  text: string;
  timestamp_seconds: number | null;
}

function inlineText(node: PMNode): string {
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "timestamp": {
      const seconds = Number(node.attrs?.seconds);
      return Number.isFinite(seconds) ? `[${formatTimestamp(seconds)}]` : "";
    }
    case "scripture":
      return String(node.attrs?.label ?? node.attrs?.osis ?? "");
    default:
      return (node.content ?? []).map(inlineText).join("");
  }
}

function firstTimestamp(node: PMNode): number | null {
  if (node.type === "timestamp") {
    const seconds = Number(node.attrs?.seconds);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  for (const child of node.content ?? []) {
    // Nested lists belong to their own blocks.
    if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") continue;
    const t = firstTimestamp(child);
    if (t !== null) return t;
  }
  return null;
}

/** Text of a block excluding nested lists (they are separate blocks). */
function blockText(node: PMNode): string {
  if (node.type === "listItem" || node.type === "taskItem" || node.type === "blockquote") {
    const parts: string[] = [];
    for (const child of node.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") continue;
      parts.push(inlineText(child));
    }
    const text = parts.join("\n");
    if (node.type === "taskItem") return `${node.attrs?.checked ? "[x]" : "[ ]"} ${text}`;
    return text;
  }
  return inlineText(node);
}

export function deriveBlocks(doc: PMNode): DerivedBlock[] {
  const blocks: DerivedBlock[] = [];
  const seen = new Set<string>();

  const walk = (node: PMNode, insideBlock: boolean) => {
    const id = typeof node.attrs?.id === "string" ? node.attrs.id : null;
    const isBlock = BLOCK_TYPES.has(node.type) && id !== null && !insideBlock;
    if (isBlock && id && !seen.has(id)) {
      seen.add(id);
      const text = blockText(node).trim();
      if (text) {
        blocks.push({
          block_id: id.slice(0, 64),
          position: blocks.length,
          block_type: node.type === "heading" ? `heading${Number(node.attrs?.level ?? 1)}` : node.type,
          text,
          timestamp_seconds: firstTimestamp(node),
        });
      }
    }
    for (const child of node.content ?? []) {
      const childIsNestedList = child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList";
      // Children of a block are part of it, except nested lists which hold their own blocks.
      walk(child, (isBlock || insideBlock) && !childIsNestedList);
    }
  };
  walk(doc, false);
  return blocks;
}

export function derivePlainText(doc: PMNode): string {
  const lines: string[] = [];
  const walk = (node: PMNode) => {
    if (BLOCK_TYPES.has(node.type)) {
      const text = blockText(node).trim();
      if (text) lines.push(node.type === "listItem" ? `• ${text}` : text);
      for (const child of node.content ?? []) {
        if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") walk(child);
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return lines.join("\n");
}

export const EMPTY_DOC: PMNode = { type: "doc", content: [] };
