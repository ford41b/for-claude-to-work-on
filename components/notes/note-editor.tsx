"use client";

import Highlight from "@tiptap/extension-highlight";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import Placeholder from "@tiptap/extension-placeholder";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BookOpen,
  Bold,
  Check,
  CloudOff,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Loader,
  Quote,
  Redo2,
  Timer,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePlayer } from "@/components/player/player-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/client/cn";
import { ScriptureNode, TimestampNode } from "./extensions";
import { useNoteSync, type SyncStatus } from "./use-note-sync";

const BLOCK_TYPES = ["heading", "paragraph", "blockquote", "listItem", "taskItem", "codeBlock"];

function shortId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-[9px] transition-colors duration-150",
        active ? "bg-pen-wash text-pen" : "text-ink-muted hover:bg-paper-sunk hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function SyncIndicator({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { icon: ReactNode; text: string; tone: string }> = {
    saved: { icon: <Check className="size-3.5" aria-hidden="true" />, text: "Saved", tone: "text-ink-muted" },
    saving: { icon: <Loader className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />, text: "Saving…", tone: "text-ink-muted" },
    local: { icon: <CloudOff className="size-3.5" aria-hidden="true" />, text: "Saved on this device", tone: "text-ink-muted" },
    error: { icon: <TriangleAlert className="size-3.5" aria-hidden="true" />, text: "Couldn't sync — retrying", tone: "text-caution" },
  };
  const m = map[status];
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", m.tone)}>
      {m.icon}
      {m.text}
    </span>
  );
}

function Toolbar({ editor, sermonId, compact }: { editor: Editor; sermonId: string; compact?: boolean }) {
  const player = usePlayer();
  const toast = useToast();
  const [scriptureOpen, setScriptureOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      highlight: e.isActive("highlight"),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const insertTime = () => {
    const t = player?.currentTime();
    if (t === null || t === undefined) {
      toast.show("Start the sermon video to capture its current time.");
      return;
    }
    editor.chain().focus().insertContent([{ type: "timestamp", attrs: { seconds: Math.floor(t) } }, { type: "text", text: " " }]).run();
  };

  const addScripture = async (e: FormEvent) => {
    e.preventDefault();
    const value = reference.trim();
    if (!value) return;
    setBusy(true);
    let label = value;
    let osis: string | null = null;
    try {
      const res = await fetch(`/api/sermons/${sermonId}/scripture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: value, clientId: crypto.randomUUID(), timestampStart: player?.currentTime() ?? null }),
      });
      const body = (await res.json().catch(() => null)) as { normalized?: string; osis?: string; error?: { message: string } } | null;
      if (res.ok && body?.normalized) {
        label = body.normalized;
        osis = body.osis ?? null;
      } else if (res.status === 400) {
        toast.show(body?.error?.message ?? "That doesn't look like a Bible reference.", { tone: "error" });
        setBusy(false);
        return;
      }
    } catch {
      // Offline: keep the reference as typed; it is detected again from the note text later.
    }
    editor.chain().focus().insertContent([{ type: "scripture", attrs: { label, osis } }, { type: "text", text: " " }]).run();
    setReference("");
    setScriptureOpen(false);
    setBusy(false);
  };

  return (
    <div className="relative">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto py-1 [scrollbar-width:none]">
        <ToolButton label="Add current sermon time" onClick={insertTime} disabled={!player?.available}>
          <Timer className="size-[1.1rem]" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Add Scripture reference" active={scriptureOpen} onClick={() => setScriptureOpen((v) => !v)}>
          <BookOpen className="size-[1.1rem]" aria-hidden="true" />
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-rule" />
        <ToolButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-[1.1rem]" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-[1.1rem]" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Highlight as important" active={state.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Highlighter className="size-[1.1rem]" aria-hidden="true" />
        </ToolButton>
        {!compact ? (
          <>
            <ToolButton label="Heading" active={state.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Checklist" active={state.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>
              <ListChecks className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-rule" />
            <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 className="size-[1.1rem]" aria-hidden="true" />
            </ToolButton>
          </>
        ) : null}
      </div>
      {scriptureOpen ? (
        <form onSubmit={addScripture} className="mt-1 flex gap-2 rounded-[12px] border border-rule bg-paper-raised p-2 shadow-[var(--shadow-float)]">
          <label htmlFor="scripture-ref" className="sr-only">
            Bible reference
          </label>
          <input
            id="scripture-ref"
            autoFocus
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Romans 8:28 or Psalm twenty-three"
            className="h-10 min-w-0 flex-1 rounded-[9px] border border-field bg-paper px-3 text-base focus:border-pen focus:outline-none"
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !reference.trim()} className="h-10 rounded-[9px] bg-pen px-4 text-sm font-semibold text-on-pen disabled:opacity-50">
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}

export interface NoteEditorProps {
  noteId: string;
  sermonId: string;
  initialTitle: string;
  initialContent: unknown;
  initialVersion: number;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  className?: string;
  hideTitle?: boolean;
  onEditor?: (editor: Editor | null) => void;
}

export function NoteEditor(props: NoteEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(props.initialTitle);
  const titleRef = useRef(props.initialTitle);
  const editorRef = useRef<Editor | null>(null);

  const replaceContent = useCallback((content: unknown, newTitle: string) => {
    editorRef.current?.commands.setContent(content as never, { emitUpdate: false });
    titleRef.current = newTitle;
    setTitle(newTitle);
  }, []);
  const onConflictCopy = useCallback(
    (copyTitle: string) => {
      toast.show(`This note changed elsewhere. Your version was kept as “${copyTitle}”.`, { durationMs: 10000 });
      router.refresh();
    },
    [router, toast],
  );

  const sync = useNoteSync({
    noteId: props.noteId,
    sermonId: props.sermonId,
    initial: { title: props.initialTitle, content: props.initialContent, version: props.initialVersion },
    onReplaceContent: replaceContent,
    onConflictCopy,
  });
  const { change } = sync;

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: props.autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ["http", "https"] } }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: props.placeholder ?? "Write what you're hearing…" }),
      UniqueID.configure({ types: BLOCK_TYPES, generateID: shortId }),
      TimestampNode,
      ScriptureNode,
    ],
    content: (props.initialContent as object) ?? { type: "doc", content: [] },
    editorProps: {
      attributes: {
        class: "note-editor",
        "aria-label": "Sermon notes",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: e }) => change(e.getJSON(), titleRef.current),
  });
  const onEditor = props.onEditor;
  useEffect(() => {
    editorRef.current = editor;
    onEditor?.(editor);
  }, [editor, onEditor]);

  // Deep links from citations: /notes#block-<id> scrolls to and briefly marks the block.
  useEffect(() => {
    if (!editor) return;
    const hash = decodeURIComponent(window.location.hash);
    if (!hash.startsWith("#block-")) return;
    const id = hash.slice(7);
    const el = editor.view.dom.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-block-flash", "true");
    const t = window.setTimeout(() => el.removeAttribute("data-block-flash"), 2400);
    return () => window.clearTimeout(t);
  }, [editor]);

  return (
    <div className={cn("flex flex-col", props.className)}>
      <div className="sticky top-[var(--notebook-sticky,0px)] z-10 -mx-4 border-b border-rule bg-paper/95 px-4 backdrop-blur-sm">
        {editor ? <Toolbar editor={editor} sermonId={props.sermonId} compact={props.compact} /> : <div className="h-12" />}
      </div>
      <div className={cn("flex items-center justify-between gap-3 pt-4", props.hideTitle && "sr-only")}>
        <label htmlFor={`note-title-${props.noteId}`} className="sr-only">
          Note title
        </label>
        <input
          id={`note-title-${props.noteId}`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            if (editor) change(editor.getJSON(), e.target.value);
          }}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent font-read text-xl font-semibold text-ink placeholder:text-ink-faint focus:outline-none"
          placeholder="Notes"
        />
        <SyncIndicator status={sync.status} />
      </div>
      <div className="dot-grid -mx-4 min-h-[50vh] px-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
