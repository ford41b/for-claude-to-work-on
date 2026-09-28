"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { BookOpen, Play } from "lucide-react";
import { usePlayer } from "@/components/player/player-context";
import { formatTimestamp } from "@/lib/time/timestamps";

/** Inline, atomic timestamp captured from the player: "12:43". Clicking seeks the sermon. */
function TimestampView({ node }: ReactNodeViewProps) {
  const player = usePlayer();
  const seconds = Number(node.attrs.seconds);
  const label = Number.isFinite(seconds) ? formatTimestamp(seconds) : "--:--";
  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        contentEditable={false}
        onClick={() => player?.available && player.seek(seconds)}
        className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-pen/40 bg-pen-wash px-2 py-0.5 align-middle font-mono text-[0.8rem] font-semibold leading-none text-pen tabular"
        aria-label={`Sermon time ${label}${player?.available ? ". Play from here." : ""}`}
      >
        <Play className="size-3" aria-hidden="true" strokeWidth={2.6} />
        {label}
      </button>
    </NodeViewWrapper>
  );
}

export const TimestampNode = Node.create({
  name: "timestamp",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { seconds: { default: 0 } };
  },
  parseHTML() {
    return [{ tag: "span[data-timestamp]", getAttrs: (el) => ({ seconds: Number((el as HTMLElement).dataset.timestamp) }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-timestamp": node.attrs.seconds }), formatTimestamp(Number(node.attrs.seconds))];
  },
  renderText({ node }) {
    return `[${formatTimestamp(Number(node.attrs.seconds))}]`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(TimestampView);
  },
});

function ScriptureView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        contentEditable={false}
        className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-rule-strong bg-paper-raised px-2 py-0.5 align-middle font-ui text-[0.8rem] font-semibold leading-none text-ink"
      >
        <BookOpen className="size-3" aria-hidden="true" strokeWidth={2.4} />
        {String(node.attrs.label)}
      </span>
    </NodeViewWrapper>
  );
}

/** Inline Scripture reference chip: "Romans 8:28" (normalized when online). */
export const ScriptureNode = Node.create({
  name: "scripture",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: "" }, osis: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span[data-scripture]", getAttrs: (el) => ({ label: (el as HTMLElement).textContent, osis: (el as HTMLElement).dataset.scripture || null }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-scripture": node.attrs.osis ?? "" }), String(node.attrs.label)];
  },
  renderText({ node }) {
    return String(node.attrs.label);
  },
  addNodeView() {
    return ReactNodeViewRenderer(ScriptureView);
  },
});
