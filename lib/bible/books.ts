/**
 * Canonical Protestant canon (66 books) keyed by OSIS book code. Display names follow common
 * English usage. `singular` is used when a single chapter is referenced ("Psalm 23").
 */
export interface BibleBook {
  osis: string;
  name: string;
  singular?: string;
  testament: "OT" | "NT";
  order: number;
  chapters: number;
}

const BOOKS: Omit<BibleBook, "order">[] = [
  { osis: "Gen", name: "Genesis", testament: "OT", chapters: 50 },
  { osis: "Exod", name: "Exodus", testament: "OT", chapters: 40 },
  { osis: "Lev", name: "Leviticus", testament: "OT", chapters: 27 },
  { osis: "Num", name: "Numbers", testament: "OT", chapters: 36 },
  { osis: "Deut", name: "Deuteronomy", testament: "OT", chapters: 34 },
  { osis: "Josh", name: "Joshua", testament: "OT", chapters: 24 },
  { osis: "Judg", name: "Judges", testament: "OT", chapters: 21 },
  { osis: "Ruth", name: "Ruth", testament: "OT", chapters: 4 },
  { osis: "1Sam", name: "1 Samuel", testament: "OT", chapters: 31 },
  { osis: "2Sam", name: "2 Samuel", testament: "OT", chapters: 24 },
  { osis: "1Kgs", name: "1 Kings", testament: "OT", chapters: 22 },
  { osis: "2Kgs", name: "2 Kings", testament: "OT", chapters: 25 },
  { osis: "1Chr", name: "1 Chronicles", testament: "OT", chapters: 29 },
  { osis: "2Chr", name: "2 Chronicles", testament: "OT", chapters: 36 },
  { osis: "Ezra", name: "Ezra", testament: "OT", chapters: 10 },
  { osis: "Neh", name: "Nehemiah", testament: "OT", chapters: 13 },
  { osis: "Esth", name: "Esther", testament: "OT", chapters: 10 },
  { osis: "Job", name: "Job", testament: "OT", chapters: 42 },
  { osis: "Ps", name: "Psalms", singular: "Psalm", testament: "OT", chapters: 150 },
  { osis: "Prov", name: "Proverbs", testament: "OT", chapters: 31 },
  { osis: "Eccl", name: "Ecclesiastes", testament: "OT", chapters: 12 },
  { osis: "Song", name: "Song of Songs", testament: "OT", chapters: 8 },
  { osis: "Isa", name: "Isaiah", testament: "OT", chapters: 66 },
  { osis: "Jer", name: "Jeremiah", testament: "OT", chapters: 52 },
  { osis: "Lam", name: "Lamentations", testament: "OT", chapters: 5 },
  { osis: "Ezek", name: "Ezekiel", testament: "OT", chapters: 48 },
  { osis: "Dan", name: "Daniel", testament: "OT", chapters: 12 },
  { osis: "Hos", name: "Hosea", testament: "OT", chapters: 14 },
  { osis: "Joel", name: "Joel", testament: "OT", chapters: 3 },
  { osis: "Amos", name: "Amos", testament: "OT", chapters: 9 },
  { osis: "Obad", name: "Obadiah", testament: "OT", chapters: 1 },
  { osis: "Jonah", name: "Jonah", testament: "OT", chapters: 4 },
  { osis: "Mic", name: "Micah", testament: "OT", chapters: 7 },
  { osis: "Nah", name: "Nahum", testament: "OT", chapters: 3 },
  { osis: "Hab", name: "Habakkuk", testament: "OT", chapters: 3 },
  { osis: "Zeph", name: "Zephaniah", testament: "OT", chapters: 3 },
  { osis: "Hag", name: "Haggai", testament: "OT", chapters: 2 },
  { osis: "Zech", name: "Zechariah", testament: "OT", chapters: 14 },
  { osis: "Mal", name: "Malachi", testament: "OT", chapters: 4 },
  { osis: "Matt", name: "Matthew", testament: "NT", chapters: 28 },
  { osis: "Mark", name: "Mark", testament: "NT", chapters: 16 },
  { osis: "Luke", name: "Luke", testament: "NT", chapters: 24 },
  { osis: "John", name: "John", testament: "NT", chapters: 21 },
  { osis: "Acts", name: "Acts", testament: "NT", chapters: 28 },
  { osis: "Rom", name: "Romans", testament: "NT", chapters: 16 },
  { osis: "1Cor", name: "1 Corinthians", testament: "NT", chapters: 16 },
  { osis: "2Cor", name: "2 Corinthians", testament: "NT", chapters: 13 },
  { osis: "Gal", name: "Galatians", testament: "NT", chapters: 6 },
  { osis: "Eph", name: "Ephesians", testament: "NT", chapters: 6 },
  { osis: "Phil", name: "Philippians", testament: "NT", chapters: 4 },
  { osis: "Col", name: "Colossians", testament: "NT", chapters: 4 },
  { osis: "1Thess", name: "1 Thessalonians", testament: "NT", chapters: 5 },
  { osis: "2Thess", name: "2 Thessalonians", testament: "NT", chapters: 3 },
  { osis: "1Tim", name: "1 Timothy", testament: "NT", chapters: 6 },
  { osis: "2Tim", name: "2 Timothy", testament: "NT", chapters: 4 },
  { osis: "Titus", name: "Titus", testament: "NT", chapters: 3 },
  { osis: "Phlm", name: "Philemon", testament: "NT", chapters: 1 },
  { osis: "Heb", name: "Hebrews", testament: "NT", chapters: 13 },
  { osis: "Jas", name: "James", testament: "NT", chapters: 5 },
  { osis: "1Pet", name: "1 Peter", testament: "NT", chapters: 5 },
  { osis: "2Pet", name: "2 Peter", testament: "NT", chapters: 3 },
  { osis: "1John", name: "1 John", testament: "NT", chapters: 5 },
  { osis: "2John", name: "2 John", testament: "NT", chapters: 1 },
  { osis: "3John", name: "3 John", testament: "NT", chapters: 1 },
  { osis: "Jude", name: "Jude", testament: "NT", chapters: 1 },
  { osis: "Rev", name: "Revelation", testament: "NT", chapters: 22 },
];

export const BIBLE_BOOKS: readonly BibleBook[] = BOOKS.map((b, i) => ({ ...b, order: i + 1 }));

const BY_OSIS = new Map(BIBLE_BOOKS.map((b) => [b.osis, b]));

export function getBook(osis: string): BibleBook | undefined {
  return BY_OSIS.get(osis);
}

export function isCanonicalBook(osis: string): boolean {
  return BY_OSIS.has(osis);
}
