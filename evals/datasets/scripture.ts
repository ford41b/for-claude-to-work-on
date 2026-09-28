/**
 * Gold set for deterministic Scripture detection. Sentences are written the way they appear in
 * sermon analyses, listener notes, and slide photos: abbreviations, spoken numbers, ranges,
 * story names, and ordinary sentences that look like references but are not.
 *
 * `expect` lists OSIS ids (the parser's canonical form, e.g. "Rom.8.28", "John.3.16-John.3.18").
 * `kinds` optionally pins the detection kind for a given OSIS.
 * `known` marks a case the engine is known to miss today; it still counts in the score, and the
 * report lists it separately so regressions and improvements are both visible.
 */

export interface ScriptureCase {
  id: string;
  text: string;
  expect: string[];
  kinds?: Record<string, "explicit" | "spoken" | "allusion">;
  known?: string;
}

export const SCRIPTURE_CASES: ScriptureCase[] = [
  // --- Explicit, written the usual ways ---------------------------------------------------
  { id: "explicit-basic", text: "Our text today is John 3:16.", expect: ["John.3.16"], kinds: { "John.3.16": "explicit" } },
  { id: "explicit-abbrev", text: "Jn 3:16 and Rom 8:28 were on the screen.", expect: ["John.3.16", "Rom.8.28"] },
  { id: "explicit-range", text: "Read Romans 8:24-25 this week.", expect: ["Rom.8.24-Rom.8.25"] },
  { id: "explicit-en-dash", text: "Hebrews 11:1–3 frames the whole series.", expect: ["Heb.11.1-Heb.11.3"] },
  { id: "explicit-cross-chapter", text: "Genesis 1:1–2:3 is the creation account.", expect: ["Gen.1.1-Gen.2.3"] },
  { id: "explicit-chapter-only", text: "Psalm 23 was read before the sermon.", expect: ["Ps.23"] },
  { id: "explicit-chapter-range", text: "He preached through Matthew 5-7 this summer.", expect: ["Matt.5-Matt.7"] },
  { id: "explicit-numbered-book", text: "1 Corinthians 13:4-7 describes love.", expect: ["1Cor.13.4-1Cor.13.7"] },
  { id: "explicit-roman-numeral", text: "See II Timothy 3:16 on Scripture.", expect: ["2Tim.3.16"] },
  { id: "explicit-list-same-book", text: "Isaiah 40:31, 41:10 both speak of strength.", expect: ["Isa.40.31", "Isa.41.10"] },
  { id: "explicit-semicolon-list", text: "Phil 4:6-7; Matt 6:34", expect: ["Phil.4.6-Phil.4.7", "Matt.6.34"] },
  { id: "explicit-verse-list", text: "Romans 8:28, 38-39 closes the chapter.", expect: ["Rom.8.28", "Rom.8.38-Rom.8.39"] },
  { id: "explicit-lowercase", text: "look up eph 2:8-9 later", expect: ["Eph.2.8-Eph.2.9"] },
  { id: "explicit-slide-ocr", text: "FAITH IN THE WAITING\nRomans 8:24-25 (ESV)", expect: ["Rom.8.24-Rom.8.25"] },
  { id: "explicit-single-chapter-book", text: "Jude 24 is the benediction.", expect: ["Jude.1.24"] },
  { id: "explicit-psalms-plural", text: "Psalms 1-2 introduce the Psalter.", expect: ["Ps.1-Ps.2"] },
  { id: "explicit-song-of-songs", text: "Song of Solomon 2:4 was mentioned briefly.", expect: ["Song.2.4"] },
  { id: "explicit-1john", text: "1 John 4:8 says God is love.", expect: ["1John.4.8"] },
  { id: "explicit-abbrev-isaiah", text: "Is 40:31 was on the bulletin.", expect: ["Isa.40.31"] },
  { id: "explicit-abbrev-amos", text: "Am 5:24 — let justice roll down.", expect: ["Amos.5.24"] },
  { id: "explicit-lowercase-verse", text: "reread mark 4:35-41 tonight", expect: ["Mark.4.35-Mark.4.41"] },
  { id: "explicit-chapter-acts", text: "Acts 2 was our reading.", expect: ["Acts.2"] },
  { id: "explicit-misspelled-revelation", text: "Revelations 21:4 was the closing verse.", expect: ["Rev.21.4"] },
  { id: "explicit-ordinal-suffix", text: "1st Peter 5:7 — cast your anxiety.", expect: ["1Pet.5.7"] },
  { id: "explicit-numbers", text: "Numbers 6:24-26 is the blessing.", expect: ["Num.6.24-Num.6.26"] },
  { id: "explicit-verse-word", text: "Psalm 23 verse 4.", expect: ["Ps.23.4"] },

  // --- Spoken forms from recordings ---------------------------------------------------------
  { id: "spoken-chapter", text: "Turn with me to Romans eight.", expect: ["Rom.8"], kinds: { "Rom.8": "spoken" } },
  { id: "spoken-chapter-verse", text: "Romans chapter eight verse twenty eight says all things work together.", expect: ["Rom.8.28"] },
  { id: "spoken-ordinal-book", text: "First Corinthians thirteen is the love chapter.", expect: ["1Cor.13"] },
  { id: "spoken-compact", text: "Second Timothy three sixteen.", expect: ["2Tim.3.16"] },
  { id: "spoken-hundreds", text: "Psalm one hundred nineteen verse one hundred and five.", expect: ["Ps.119.105"] },
  { id: "spoken-hyphenated", text: "Psalm twenty-three is familiar to most of us.", expect: ["Ps.23"] },
  { id: "spoken-first-john", text: "First John four eight.", expect: ["1John.4.8"] },
  { id: "spoken-hebrews", text: "Hebrews eleven one defines faith.", expect: ["Heb.11.1"] },
  { id: "spoken-cardinal-book", text: "Two Corinthians five seventeen, the new creation.", expect: ["2Cor.5.17"] },
  { id: "spoken-verse-word", text: "Matthew 11 verses 28 through 30.", expect: ["Matt.11.28-Matt.11.30"] },
  { id: "spoken-comma-verse", text: "In Philippians four, verse thirteen, Paul says it plainly.", expect: ["Phil.4.13"] },
  { id: "spoken-and", text: "Ephesians two eight and nine.", expect: ["Eph.2.8", "Eph.2.9"] },

  // --- Story names (allusions) --------------------------------------------------------------
  { id: "allusion-prodigal", text: "He retold the prodigal son from the older brother's side.", expect: ["Luke.15.11-Luke.15.32"], kinds: { "Luke.15.11-Luke.15.32": "allusion" } },
  { id: "allusion-samaritan", text: "Like the good Samaritan, we stop for people.", expect: ["Luke.10.25-Luke.10.37"] },
  { id: "allusion-armor", text: "Put on the armor of God.", expect: ["Eph.6.10-Eph.6.18"] },
  { id: "allusion-plus-explicit", text: "David and Goliath (1 Samuel 17) was the illustration.", expect: ["1Sam.17"], kinds: { "1Sam.17": "explicit" } },
  { id: "allusion-overlaps-explicit", text: "He quoted Matthew 28:19-20, the Great Commission.", expect: ["Matt.28.19-Matt.28.20"] },
  { id: "allusion-shepherd", text: "The shepherd's psalm was sung at the close.", expect: ["Ps.23"] },

  // --- Mixed ---------------------------------------------------------------------------------
  {
    id: "mixed-note",
    text: "God works while I wait. Look up Romans 8:28 again, and the lost sheep story.",
    expect: ["Rom.8.28", "Luke.15.3-Luke.15.7"],
  },
  {
    id: "mixed-segment",
    text: "The pastor read Isaiah forty thirty-one and then compared it with Psalm 27:14.",
    expect: ["Isa.40.31", "Ps.27.14"],
  },

  // --- Must NOT match ------------------------------------------------------------------------
  { id: "neg-numbers", text: "One of the things he said was to pray for two people.", expect: [] },
  { id: "neg-time", text: "Service starts at 10:30 and the second one at 11:45.", expect: [] },
  { id: "neg-name-john", text: "John said the coffee was ready after the service.", expect: [] },
  { id: "neg-mark-my-words", text: "Mark my words, this series will change how you pray.", expect: [] },
  { id: "neg-acts-of-kindness", text: "Small acts of kindness matter this week.", expect: [] },
  { id: "neg-fake-book", text: "Hezekiah 4:1 is not a real reference.", expect: [] },
  { id: "neg-out-of-range", text: "John 3:99 and Genesis 51 do not exist.", expect: [] },
  { id: "neg-chapter-of-life", text: "This is a new chapter two of my life.", expect: [] },
  { id: "neg-mustard-colored", text: "She wore a mustard sweater.", expect: [] },
  { id: "neg-am", text: "I am 5 minutes late to church.", expect: [] },
  { id: "neg-is", text: "He is 40 now and still leads worship.", expect: [] },
  { id: "neg-is-question", text: "Is 5 enough for the small group?", expect: [] },
  { id: "neg-numbers-lower", text: "the numbers 6 and 7 were on the board", expect: [] },
  { id: "neg-so", text: "so 3 people signed up", expect: [] },
  { id: "neg-act", text: "Act 2 of the kids' play starts after lunch.", expect: [] },
  { id: "neg-song-lower", text: "the song 3 was loud", expect: [] },
  { id: "neg-names", text: "James and John went fishing; Daniel read Ruth a story.", expect: [] },
  {
    id: "neg-job-chapter",
    text: "Job 5 was a hard week at work.",
    expect: [],
    known: "A capitalized book name followed by a number reads the same as a reference; needs sentence-level context.",
  },
];
