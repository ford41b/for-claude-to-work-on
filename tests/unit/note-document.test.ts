import { describe, expect, it } from "vitest";
import { deriveBlocks, derivePlainText, pmDocSchema, type PMNode } from "@/lib/notes/document";

const doc: PMNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { id: "h1", level: 2 }, content: [{ type: "text", text: "Waiting" }] },
    {
      type: "paragraph",
      attrs: { id: "p1" },
      content: [
        { type: "timestamp", attrs: { seconds: 763 } },
        { type: "text", text: " Faith means continuing while the answer is unclear. " },
        { type: "scripture", attrs: { osis: "Rom.8.28", label: "Romans 8:28" } },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          attrs: { id: "li1" },
          content: [
            { type: "paragraph", attrs: { id: "li1p" }, content: [{ type: "text", text: "Pray first" }] },
            {
              type: "bulletList",
              content: [
                { type: "listItem", attrs: { id: "li2" }, content: [{ type: "paragraph", attrs: { id: "li2p" }, content: [{ type: "text", text: "Nested" }] }] },
              ],
            },
          ],
        },
      ],
    },
    { type: "taskList", content: [{ type: "taskItem", attrs: { id: "t1", checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Call Sam" }] }] }] },
    { type: "paragraph", attrs: { id: "empty" }, content: [] },
  ],
};

describe("note document", () => {
  it("validates shape", () => {
    expect(pmDocSchema.safeParse(doc).success).toBe(true);
    expect(pmDocSchema.safeParse({ type: "notdoc" }).success).toBe(false);
  });

  it("derives citable blocks with timestamps, excluding nested-list text from parents", () => {
    const blocks = deriveBlocks(doc);
    expect(blocks.map((b) => [b.block_id, b.block_type, b.text, b.timestamp_seconds])).toEqual([
      ["h1", "heading2", "Waiting", null],
      ["p1", "paragraph", "[12:43] Faith means continuing while the answer is unclear. Romans 8:28", 763],
      ["li1", "listItem", "Pray first", null],
      ["li2", "listItem", "Nested", null],
      ["t1", "taskItem", "[x] Call Sam", null],
    ]);
    expect(blocks.map((b) => b.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("derives plain text", () => {
    expect(derivePlainText(doc)).toBe(
      "Waiting\n[12:43] Faith means continuing while the answer is unclear. Romans 8:28\n• Pray first\n• Nested\n[x] Call Sam",
    );
  });
});
