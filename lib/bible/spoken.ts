/**
 * Converts spoken-style Scripture references into numeric form so the reference parser can
 * read them: "Romans eight" → "Romans 8", "Psalm twenty-three" → "Psalm 23",
 * "John three sixteen" → "John 3:16", "First Corinthians thirteen verses four through seven"
 * → "1 Corinthians 13:4-7".
 *
 * Number words are only converted when they follow a book name (optionally via "chapter",
 * "verse", "and", "through"…), so ordinary prose ("one of the things…") is left untouched.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const ORDINAL_PREFIX: Record<string, string> = {
  first: "1", "1st": "1", i: "1",
  second: "2", "2nd": "2", ii: "2",
  third: "3", "3rd": "3", iii: "3",
};

/** Cardinals said in place of ordinals ("Two Corinthians"); only honoured when a number follows. */
const CARDINAL_PREFIX: Record<string, string> = { one: "1", two: "2", three: "3" };

const NUMBERED_BOOKS = [
  "samuel", "kings", "chronicles", "corinthians", "thessalonians", "timothy", "peter", "john",
];

const SINGLE_BOOK_NAMES = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth", "ezra",
  "nehemiah", "esther", "job", "psalm", "psalms", "proverbs", "ecclesiastes", "song of songs",
  "song of solomon", "isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel",
  "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah",
  "malachi", "matthew", "mark", "luke", "john", "acts", "romans", "galatians", "ephesians",
  "philippians", "colossians", "titus", "philemon", "hebrews", "james", "jude", "revelation",
  "revelations",
];

const CONNECTORS = new Set(["chapter", "chapters", "verse", "verses", "and", "through", "thru", "to", "-", "–", ",", ":"]);

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /[A-Za-z0-9]+(?:-[A-Za-z]+)?|[,:\-–]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function isNumberWord(word: string): boolean {
  if (word in UNITS || word in TENS || word === "hundred") return true;
  const [a, b] = word.split("-");
  return Boolean(a && b && a in TENS && b in UNITS && UNITS[b]! < 10);
}

/** Parses a number phrase starting at `i`. Returns the value and the index after the phrase. */
function readNumber(tokens: Token[], i: number): { value: number; next: number } | null {
  let value = 0;
  let j = i;
  let consumed = false;

  const readBelowHundred = (): number | null => {
    const t = tokens[j];
    if (!t) return null;
    const hyphen = t.lower.split("-");
    if (hyphen.length === 2 && hyphen[0]! in TENS && hyphen[1]! in UNITS) {
      j += 1;
      return TENS[hyphen[0]!]! + UNITS[hyphen[1]!]!;
    }
    if (t.lower in TENS) {
      let v = TENS[t.lower]!;
      j += 1;
      const u = tokens[j];
      if (u && u.lower in UNITS && UNITS[u.lower]! > 0 && UNITS[u.lower]! < 10) {
        v += UNITS[u.lower]!;
        j += 1;
      }
      return v;
    }
    if (t.lower in UNITS) {
      j += 1;
      return UNITS[t.lower]!;
    }
    return null;
  };

  const first = readBelowHundred();
  if (first === null) return null;
  value = first;
  consumed = true;
  if (tokens[j]?.lower === "hundred" && first > 0 && first < 10) {
    j += 1;
    value = first * 100;
    if (tokens[j]?.lower === "and") j += 1;
    const rest = readBelowHundred();
    if (rest !== null) value += rest;
  }
  return consumed ? { value, next: j } : null;
}

/** Returns the index after a book name that starts at token i, or -1. */
function matchBook(tokens: Token[], i: number): number {
  const t = tokens[i];
  if (!t) return -1;
  const ordinal = ORDINAL_PREFIX[t.lower];
  if (ordinal) {
    const next = tokens[i + 1];
    if (next && NUMBERED_BOOKS.includes(next.lower)) return i + 2;
  }
  const cardinal = CARDINAL_PREFIX[t.lower];
  if (cardinal) {
    const next = tokens[i + 1];
    const after = tokens[i + 2];
    if (next && NUMBERED_BOOKS.includes(next.lower) && after && (isNumberWord(after.lower) || /^\d+$/.test(after.lower))) return i + 2;
  }
  if (/^[123]$/.test(t.lower)) {
    const next = tokens[i + 1];
    if (next && NUMBERED_BOOKS.includes(next.lower)) return i + 2;
  }
  for (const name of SINGLE_BOOK_NAMES) {
    const parts = name.split(" ");
    let ok = true;
    for (let k = 0; k < parts.length; k++) {
      if (tokens[i + k]?.lower !== parts[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return i + parts.length;
  }
  return -1;
}

/**
 * Rewrites spoken number words that follow a book name into digits, and normalizes
 * "chapter X verse Y" / "X Y" / "through" patterns. Returns the rewritten string.
 */
export function normalizeSpokenReferences(input: string): string {
  const tokens = tokenize(input);
  const replacements: { start: number; end: number; text: string }[] = [];

  let i = 0;
  while (i < tokens.length) {
    const afterBook = matchBook(tokens, i);
    if (afterBook === -1) {
      i += 1;
      continue;
    }
    // Replace an ordinal prefix ("First Corinthians" → "1 Corinthians").
    const firstTok = tokens[i]!;
    const ordinal = ORDINAL_PREFIX[firstTok.lower] ?? CARDINAL_PREFIX[firstTok.lower];
    if (ordinal && afterBook - i === 2) {
      replacements.push({ start: firstTok.start, end: firstTok.end, text: ordinal });
    }
    let j = afterBook;
    let budget = 10;
    while (j < tokens.length && budget-- > 0) {
      const tok = tokens[j]!;
      if (CONNECTORS.has(tok.lower)) {
        j += 1;
        continue;
      }
      if (/^\d+$/.test(tok.lower)) {
        j += 1;
        continue;
      }
      if (isNumberWord(tok.lower)) {
        const parsed = readNumber(tokens, j);
        if (!parsed) break;
        const startTok = tokens[j]!;
        const endTok = tokens[parsed.next - 1]!;
        replacements.push({ start: startTok.start, end: endTok.end, text: String(parsed.value) });
        j = parsed.next;
        continue;
      }
      break;
    }
    i = Math.max(j, i + 1);
  }

  let out = input;
  for (const r of replacements.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }

  // Structural rewrites on the digit form.
  out = out
    .replace(/\bchapters?\s+(\d+)/gi, "$1")
    .replace(/(\d+)\s*,?\s+(?:verses?|vv?\.)\s+(\d+)/gi, "$1:$2")
    .replace(/(\d+)\s+(?:through|thru|to)\s+(\d+)/gi, "$1-$2");

  // "Romans 8 28" (two bare numbers after a book) → "Romans 8:28".
  const bookAlternation = [
    ...SINGLE_BOOK_NAMES,
    ...NUMBERED_BOOKS.map((b) => `[123]\\s+${b}`),
  ]
    .sort((a, b) => b.length - a.length)
    .join("|");
  const twoNumbers = new RegExp(`\\b(${bookAlternation})\\s+(\\d{1,3})\\s+(\\d{1,3})\\b(?!\\s*:)`, "gi");
  out = out.replace(twoNumbers, "$1 $2:$3");

  return out;
}
