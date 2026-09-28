import { describe, expect, it } from "vitest";
import { combineHashes, hashJson, stableStringify } from "@/lib/hash";
import { clampTimestamp, formatTimestamp, formatTimestampRange, isApproximate, parseTimestamp } from "@/lib/time/timestamps";

describe("timestamps", () => {
  it("formats", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(1122.7)).toBe("18:42");
    expect(formatTimestamp(3723)).toBe("1:02:03");
    expect(formatTimestamp(1695, { approximate: true })).toBe("~28:15");
    expect(formatTimestamp(-1)).toBe("");
    expect(formatTimestamp(Number.NaN)).toBe("");
  });
  it("formats ranges", () => {
    expect(formatTimestampRange(1122, 1210, { approximate: true })).toBe("~18:42–20:10");
    expect(formatTimestampRange(1122, 1122.5)).toBe("18:42");
    expect(formatTimestampRange(null, 5)).toBe("");
  });
  it("parses", () => {
    expect(parseTimestamp("18:42")).toBe(1122);
    expect(parseTimestamp("~18:42")).toBe(1122);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("18m42s")).toBe(1122);
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("12:99")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
  });
  it("marks AI times approximate", () => {
    expect(isApproximate("ai")).toBe(true);
    expect(isApproximate(null)).toBe(true);
    expect(isApproximate("user_capture")).toBe(false);
    expect(isApproximate("user_correction")).toBe(false);
  });
  it("clamps", () => {
    expect(clampTimestamp(-5)).toBe(0);
    expect(clampTimestamp(5000, 3000)).toBe(3000);
    expect(clampTimestamp(10, null)).toBe(10);
  });
});

describe("hashing", () => {
  it("is key-order independent", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }));
    expect(hashJson({ a: 1 })).not.toBe(hashJson({ a: 2 }));
  });
  it("combines hashes independent of order but sensitive to content", () => {
    expect(combineHashes(["x", "y"])).toBe(combineHashes(["y", "x"]));
    expect(combineHashes(["x", "y"])).not.toBe(combineHashes(["x", "z"]));
    expect(combineHashes(["x", null])).not.toBe(combineHashes(["x"]));
  });
});
