import type { StoredMediaAnalysis } from "@/lib/sources/catalog";

/**
 * A synthetic sermon notebook with known ground truth. The sermon, speaker, and church are
 * invented for evaluation; nothing here is a real person's words.
 *
 * The recording analysis has the same shape the ANALYZE_* jobs store, and the notes and photo
 * go through the same unit builders as the real catalog, so the model sees production-shaped
 * input.
 */

export const NOTEBOOK_SERMON = {
  title: "Faith in the Waiting",
  speaker: null,
  church: null,
  series: null,
  date: null,
  userSetFields: [] as string[],
};

export const NOTEBOOK_DURATION = 2_760;

export const NOTEBOOK_ANALYSIS: StoredMediaAnalysis = {
  is_sermon: true,
  content_note: null,
  duration_seconds: NOTEBOOK_DURATION,
  sermon_start_seconds: 30,
  sermon_end_seconds: 2_700,
  segments: [
    {
      start: 30,
      end: 240,
      kind: "INTRODUCTION",
      summary: "The speaker opens with a story about waiting at an airport gate for a delayed flight and asks what we do with our waiting seasons.",
      key_phrases: ["Everybody is waiting on something."],
      scripture_mentions: [],
      on_screen_text: null,
      timing_confidence: "high",
    },
    {
      start: 240,
      end: 620,
      kind: "SCRIPTURE",
      summary: "Reads Romans 8:24-25 and explains that hope, by definition, is for what is not yet seen.",
      key_phrases: ["Hope that is seen is not hope."],
      scripture_mentions: ["Romans 8:24-25"],
      on_screen_text: "Romans 8:24-25",
      timing_confidence: "high",
    },
    {
      start: 620,
      end: 1_100,
      kind: "MAIN_POINT",
      summary: "First point: waiting is not passive. Biblical waiting is active trust, like a farmer who plants and tends before the harvest.",
      key_phrases: ["Waiting is not the absence of faith; it is faith with its sleeves rolled up."],
      scripture_mentions: ["James 5:7"],
      on_screen_text: null,
      timing_confidence: "medium",
    },
    {
      start: 1_100,
      end: 1_560,
      kind: "MAIN_POINT",
      summary: "Second point: God is at work in the waiting even when we cannot see it. Connects Romans 8:28 to the idea that nothing in the wait is wasted.",
      key_phrases: ["Nothing in the waiting room is wasted."],
      scripture_mentions: ["Romans 8:28"],
      on_screen_text: null,
      timing_confidence: "medium",
    },
    {
      start: 1_560,
      end: 1_980,
      kind: "ILLUSTRATION",
      summary: "Tells about a grandmother who prayed for her son for twenty years and kept a prayer journal of small answers along the way.",
      key_phrases: [],
      scripture_mentions: [],
      on_screen_text: null,
      timing_confidence: "medium",
    },
    {
      start: 1_980,
      end: 2_400,
      kind: "MAIN_POINT",
      summary: "Third point: waiting renews strength. Reads Isaiah 40:31 and says those who wait on the Lord are not stuck but being strengthened.",
      key_phrases: ["They shall mount up with wings as eagles."],
      scripture_mentions: ["Isaiah 40:31"],
      on_screen_text: null,
      timing_confidence: "medium",
    },
    {
      start: 2_400,
      end: 2_700,
      kind: "APPLICATION",
      summary: "Application: name one thing you are waiting on, write down one small sign of God's faithfulness each day this week, and pray Psalm 27:14.",
      key_phrases: ["Write down one small sign of faithfulness every day this week."],
      scripture_mentions: ["Psalm 27:14"],
      on_screen_text: null,
      timing_confidence: "high",
    },
  ],
  quotes: [{ text: "Hope that is seen is not hope.", at: 300, heard_verbatim: true, confidence: "high" }],
  illustrations: [
    { title: "Delayed flight", summary: "Waiting at a gate for a delayed flight.", kind: "STORY", start: 30, end: 240 },
    { title: "The grandmother's prayer journal", summary: "Twenty years of prayer and small answers.", kind: "STORY", start: 1_560, end: 1_980 },
  ],
  metadata: {},
};

export const NOTEBOOK_NOTES = [
  { block_id: "blk-1", text: "Hope is for what we can't see yet — Rom 8:24-25", timestamp_seconds: 310 },
  { block_id: "blk-2", text: "God works while I wait. Look up Romans 8:28 again.", timestamp_seconds: 1_200 },
  { block_id: "blk-3", text: "Start a small faithfulness journal like the grandmother did.", timestamp_seconds: null },
  { block_id: "blk-4", text: "Question: how do I know if I'm waiting or just avoiding a decision?", timestamp_seconds: null },
];

export const NOTEBOOK_PHOTO = {
  ordinal: 1,
  photo_kind: "slide",
  full_text: "FAITH IN THE WAITING\nRomans 8:24-25",
  overall_confidence: "high" as const,
  legibility_note: null,
  origin: "ai" as const,
  sermon_timestamp_seconds: 260,
};

/** What a correct Sermon Pack must reflect. */
export const NOTEBOOK_TRUTH = {
  /** Passages actually present in the sources (OSIS). */
  scripture: ["Rom.8.24-Rom.8.25", "Rom.8.28", "Jas.5.7", "Isa.40.31", "Ps.27.14"],
  primaryScripture: "Rom.8.24-Rom.8.25",
  /** Phrases heard word-for-word, or written by the listener. */
  verbatim: [
    "Everybody is waiting on something.",
    "Hope that is seen is not hope.",
    "Waiting is not the absence of faith; it is faith with its sleeves rolled up.",
    "Nothing in the waiting room is wasted.",
    "They shall mount up with wings as eagles.",
    "Write down one small sign of faithfulness every day this week.",
    "God works while I wait.",
  ],
  /** Words that must not appear as sermon claims (nothing in the sources supports them). */
  forbidden: ["Abraham", "Sarah", "Moses", "40 years in the wilderness"],
};

/** Ask AI checks: in-scope questions must cite; out-of-scope questions must say so. */
export const NOTEBOOK_QUESTIONS = [
  { id: "qa-point", question: "What was the first main point?", inScope: true, expectKeys: ["V3"] },
  { id: "qa-notes", question: "What did I write about God working while I wait?", inScope: true, expectKeys: ["N2"] },
  { id: "qa-scripture", question: "Which verse did he use for renewed strength?", inScope: true, expectKeys: ["V6"] },
  { id: "qa-out-of-scope", question: "What did the sermon say about baptism?", inScope: false, expectKeys: [] },
  { id: "qa-out-of-scope-2", question: "What did the pastor say about Abraham and Sarah?", inScope: false, expectKeys: [] },
];
