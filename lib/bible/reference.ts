import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser.js";
import * as en from "bible-passage-reference-parser/esm/lang/en.js";
import { findAllusions } from "./allusions";
import { getBook, isCanonicalBook } from "./books";
import { normalizeSpokenReferences } from "./spoken";

export type ScriptureKind = "explicit" | "spoken" | "inferred" | "allusion";
export type Confidence = "high" | "medium" | "low";

export interface ParsedPassage {
  osis: string;
  book: string;
  chapterStart: number | null;
  verseStart: number | null;
  chapterEnd: number | null;
  verseEnd: number | null;
  normalized: string;
}

export interface ScriptureMatch extends ParsedPassage {
  raw: string;
  kind: ScriptureKind;
  confidence: Confidence;
  /** Offset in the input text, or -1 when the match came from a rewritten (spoken) form. */
  index: number;
  label?: string;
}

let parser: InstanceType<typeof bcv_parser> | null = null;

function getParser() {
  if (!parser) {
    parser = new bcv_parser(en);
    parser.set_options({
      osis_compaction_strategy: "bc",
      consecutive_combination_strategy: "separate",
      book_alone_strategy: "ignore",
      invalid_passage_strategy: "ignore",
      passage_existence_strategy: "bcv",
    });
  }
  return parser;
}

interface OsisPoint {
  book: string;
  chapter: number | null;
  verse: number | null;
}

function parsePoint(point: string): OsisPoint | null {
  const [book, chapter, verse] = point.split(".");
  if (!book) return null;
  return {
    book,
    chapter: chapter !== undefined ? Number(chapter) : null,
    verse: verse !== undefined ? Number(verse) : null,
  };
}

/** Parses a single OSIS passage ("John.3.16-John.3.18", "Rom.8", "Matt.5-Matt.7"). */
export function parseOsis(osis: string): ParsedPassage | null {
  const [startRaw, endRaw] = osis.split("-");
  if (!startRaw) return null;
  const start = parsePoint(startRaw);
  const end = endRaw ? parsePoint(endRaw) : null;
  if (!start || !isCanonicalBook(start.book)) return null;
  const passage: ParsedPassage = {
    osis,
    book: start.book,
    chapterStart: start.chapter,
    verseStart: start.verse,
    chapterEnd: end?.chapter ?? start.chapter,
    verseEnd: end ? end.verse : start.verse,
    normalized: "",
  };
  passage.normalized = formatPassage(passage, end?.book);
  return passage;
}

function formatPassage(p: ParsedPassage, endBook?: string): string {
  const book = getBook(p.book);
  if (!book) return p.osis;
  const singleChapter = p.chapterStart !== null && (p.chapterEnd === null || p.chapterEnd === p.chapterStart);
  const name = singleChapter && book.singular ? book.singular : book.name;
  if (p.chapterStart === null) return name;
  if (endBook && endBook !== p.book) {
    const other = getBook(endBook);
    return `${name} ${p.chapterStart}${p.verseStart ? `:${p.verseStart}` : ""}–${other?.name ?? endBook} ${p.chapterEnd ?? ""}${p.verseEnd ? `:${p.verseEnd}` : ""}`;
  }
  // Chapter(s) only.
  if (p.verseStart === null) {
    return singleChapter ? `${name} ${p.chapterStart}` : `${name} ${p.chapterStart}–${p.chapterEnd}`;
  }
  if (singleChapter) {
    return p.verseEnd !== null && p.verseEnd !== p.verseStart
      ? `${name} ${p.chapterStart}:${p.verseStart}–${p.verseEnd}`
      : `${name} ${p.chapterStart}:${p.verseStart}`;
  }
  return `${name} ${p.chapterStart}:${p.verseStart}–${p.chapterEnd}:${p.verseEnd ?? ""}`.replace(/:$/, "");
}

export function formatOsis(osis: string): string {
  return parseOsis(osis)?.normalized ?? osis;
}

function runParser(text: string): { osis: string; indices: [number, number] }[] {
  const results = getParser().parse(text).osis_and_indices() as { osis: string; indices: [number, number] }[];
  const out: { osis: string; indices: [number, number] }[] = [];
  for (const r of results) {
    for (const part of r.osis.split(",")) {
      if (part) out.push({ osis: part, indices: r.indices });
    }
  }
  return out;
}

/**
 * Finds Scripture references in free text: explicit ("Jn 3:16"), spoken ("Romans eight"),
 * and well-known story allusions ("the prodigal son"). Each distinct passage appears once.
 */
export function findScripture(text: string, options: { includeAllusions?: boolean } = {}): ScriptureMatch[] {
  const includeAllusions = options.includeAllusions ?? true;
  if (!text.trim()) return [];
  const found = new Map<string, ScriptureMatch>();

  for (const r of runParser(text)) {
    const p = parseOsis(r.osis);
    if (!p || found.has(p.osis)) continue;
    found.set(p.osis, {
      ...p,
      raw: text.slice(r.indices[0], r.indices[1]),
      kind: "explicit",
      confidence: "high",
      index: r.indices[0],
    });
  }

  const spoken = normalizeSpokenReferences(text);
  if (spoken !== text) {
    for (const r of runParser(spoken)) {
      const p = parseOsis(r.osis);
      if (!p || found.has(p.osis)) continue;
      // If the same book+chapter was already found explicitly, this is a rewrite artifact.
      found.set(p.osis, {
        ...p,
        raw: spoken.slice(r.indices[0], r.indices[1]),
        kind: "spoken",
        confidence: "medium",
        index: -1,
      });
    }
  }

  if (includeAllusions) {
    for (const m of findAllusions(text)) {
      const p = parseOsis(m.allusion.osis);
      if (!p || found.has(p.osis)) continue;
      found.set(p.osis, {
        ...p,
        raw: text.slice(m.index, m.index + m.length),
        kind: "allusion",
        confidence: "medium",
        index: m.index,
        label: m.allusion.label,
      });
    }
  }

  return [...found.values()].sort((a, b) => {
    if (a.index === -1 && b.index === -1) return 0;
    if (a.index === -1) return 1;
    if (b.index === -1) return -1;
    return a.index - b.index;
  });
}

/** Normalizes a single user-typed or AI-reported reference. Returns null when invalid. */
export function normalizeReference(input: string): ScriptureMatch | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const matches = findScripture(trimmed, { includeAllusions: true });
  return matches[0] ?? null;
}

/** Sort key for canonical order (book order, chapter, verse). */
export function canonicalSortKey(p: Pick<ParsedPassage, "book" | "chapterStart" | "verseStart">): number {
  const order = getBook(p.book)?.order ?? 999;
  return order * 1_000_000 + (p.chapterStart ?? 0) * 1000 + (p.verseStart ?? 0);
}
