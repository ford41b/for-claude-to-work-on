import { describe, expect, it } from "vitest";
import { findScripture, formatOsis, normalizeReference, parseOsis } from "@/lib/bible/reference";
import { normalizeSpokenReferences } from "@/lib/bible/spoken";

const norm = (s: string) => normalizeReference(s)?.normalized ?? null;

describe("normalizeReference", () => {
  it.each([
    ["John 3:16", "John 3:16"],
    ["Jn 3:16", "John 3:16"],
    ["jn 3:16", "John 3:16"],
    ["Romans eight", "Romans 8"],
    ["Psalm twenty-three", "Psalm 23"],
    ["Psalm twenty three", "Psalm 23"],
    ["First Corinthians thirteen", "1 Corinthians 13"],
    ["First Corinthians 13", "1 Corinthians 13"],
    ["1 cor 13:4-7", "1 Corinthians 13:4–7"],
    ["Second Timothy three sixteen", "2 Timothy 3:16"],
    ["John chapter three verse sixteen", "John 3:16"],
    ["Romans eight twenty-eight", "Romans 8:28"],
    ["Psalm one hundred nineteen", "Psalm 119"],
    ["Psalm one hundred and nineteen verse one hundred and five", "Psalm 119:105"],
    ["Hebrews 11:1–3", "Hebrews 11:1–3"],
    ["Matthew 5-7", "Matthew 5–7"],
    ["Ps 23", "Psalm 23"],
    ["Psalms 1-2", "Psalms 1–2"],
    ["the prodigal son", "Luke 15:11–32"],
  ])("%s → %s", (input, expected) => {
    expect(norm(input)).toBe(expected);
  });

  it("rejects references that do not exist", () => {
    expect(normalizeReference("John 3:99")).toBeNull();
    expect(normalizeReference("Genesis 51")).toBeNull();
    expect(normalizeReference("Hezekiah 3:1")).toBeNull();
    expect(normalizeReference("")).toBeNull();
  });

  it("labels kinds and confidence", () => {
    expect(normalizeReference("John 3:16")).toMatchObject({ kind: "explicit", confidence: "high" });
    expect(normalizeReference("Romans eight")).toMatchObject({ kind: "spoken", confidence: "medium" });
    expect(normalizeReference("the good Samaritan")).toMatchObject({ kind: "allusion", confidence: "medium" });
  });
});

describe("findScripture", () => {
  it("finds multiple explicit references in prose, in order", () => {
    const found = findScripture("Read Phil 4:6-7 and then Matt 6:34 before Isaiah 40:31, 41:10.");
    expect(found.map((f) => f.normalized)).toEqual([
      "Philippians 4:6–7",
      "Matthew 6:34",
      "Isaiah 40:31",
      "Isaiah 41:10",
    ]);
  });

  it("does not convert unrelated number words", () => {
    expect(findScripture("One of the things he said was to pray for two people.")).toEqual([]);
  });

  it("finds spoken references in transcribed speech", () => {
    const found = findScripture("If you have your Bibles turn with me to Romans chapter eight verse twenty eight.");
    expect(found.map((f) => f.normalized)).toEqual(["Romans 8:28"]);
  });

  it("deduplicates repeated passages", () => {
    const found = findScripture("John 3:16. Again, John 3:16!");
    expect(found).toHaveLength(1);
  });
});

describe("OSIS helpers", () => {
  it("parses ranges", () => {
    expect(parseOsis("John.3.16-John.3.18")).toMatchObject({
      book: "John",
      chapterStart: 3,
      verseStart: 16,
      chapterEnd: 3,
      verseEnd: 18,
      normalized: "John 3:16–18",
    });
    expect(parseOsis("John.3.16-John.4.2")?.normalized).toBe("John 3:16–4:2");
    expect(formatOsis("Ps.23")).toBe("Psalm 23");
    expect(formatOsis("Gen.1")).toBe("Genesis 1");
    expect(parseOsis("Nope.1")).toBeNull();
  });
});

describe("normalizeSpokenReferences", () => {
  it("rewrites ordinals and number words after book names only", () => {
    expect(normalizeSpokenReferences("First John four eight")).toBe("1 John 4:8");
    expect(normalizeSpokenReferences("It was one of those days")).toBe("It was one of those days");
  });
});
