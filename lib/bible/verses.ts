/**
 * A few fixed verses shown quietly around the app (the sidebar, sign-in, empty states).
 *
 * Text is the World English Bible (WEB), which is in the public domain, copied verbatim from
 * github.com/TehShrike/world-english-bible. It is the only verse text the app ships: sermon
 * Scripture still shows references alone until a licensed provider is configured. Never edit
 * the wording; replace a verse by copying another one exactly from the same source.
 */
export interface FixedVerse {
  reference: string;
  text: string;
}

export const TRANSLATION_LABEL = "WEB";

export const VERSES = {
  lamp: { reference: "Psalm 119:105", text: "Your word is a lamp to my feet, and a light for my path." },
  hidden: { reference: "Psalm 119:11", text: "I have hidden your word in my heart, that I might not sin against you." },
  doers: { reference: "James 1:22", text: "But be doers of the word, and not only hearers, deluding your own selves." },
  pondering: { reference: "Luke 2:19", text: "But Mary kept all these sayings, pondering them in her heart." },
  bereans: {
    reference: "Acts 17:11",
    text: "Now these were more noble than those in Thessalonica, in that they received the word with all readiness of mind, examining the Scriptures daily to see whether these things were so.",
  },
} as const satisfies Record<string, FixedVerse>;
