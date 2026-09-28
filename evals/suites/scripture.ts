import { findScripture } from "@/lib/bible/reference";
import { SCRIPTURE_CASES } from "../datasets/scripture";
import { ratio, type CaseFailure, type SuiteResult } from "../lib";

/**
 * Deterministic Scripture detection (no model). Precision matters most: a false reference in
 * a listener's notebook is worse than a missed one, because it looks authoritative.
 */
export function runScriptureSuite(): SuiteResult {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let exact = 0;
  let kindChecks = 0;
  let kindCorrect = 0;
  let negatives = 0;
  let negativeHits = 0;
  const failures: CaseFailure[] = [];

  for (const c of SCRIPTURE_CASES) {
    const found = findScripture(c.text);
    const got = new Set(found.map((m) => m.osis));
    const want = new Set(c.expect);
    const missing = [...want].filter((o) => !got.has(o));
    const extra = [...got].filter((o) => !want.has(o));
    tp += [...want].filter((o) => got.has(o)).length;
    fn += missing.length;
    fp += extra.length;
    if (want.size === 0) {
      negatives++;
      if (got.size) negativeHits++;
    }

    const kindErrors: string[] = [];
    for (const [osis, kind] of Object.entries(c.kinds ?? {})) {
      kindChecks++;
      const m = found.find((f) => f.osis === osis);
      if (m?.kind === kind) kindCorrect++;
      else kindErrors.push(`${osis} expected ${kind}, got ${m?.kind ?? "nothing"}`);
    }

    if (!missing.length && !extra.length && !kindErrors.length) {
      exact++;
      continue;
    }
    const parts = [
      missing.length ? `missed ${missing.join(", ")}` : null,
      extra.length ? `false ${extra.join(", ")}` : null,
      ...kindErrors,
    ].filter(Boolean);
    failures.push({ id: c.id, detail: `${parts.join("; ")} — “${c.text}”`, known: c.known });
  }

  return {
    suite: "scripture",
    description: "Deterministic Scripture detection over notes, slides, and spoken analysis text",
    info: { cases: SCRIPTURE_CASES.length, negative_cases: negatives },
    metrics: [
      { name: "precision", value: ratio(tp, tp + fp), unit: "ratio", min: 0.97 },
      { name: "recall", value: ratio(tp, tp + fn), unit: "ratio", min: 0.95 },
      { name: "exact_case_rate", value: ratio(exact, SCRIPTURE_CASES.length), unit: "ratio", min: 0.95 },
      { name: "kind_accuracy", value: ratio(kindCorrect, kindChecks), unit: "ratio", min: 1 },
      { name: "negative_case_false_hits", value: negativeHits, unit: "count", max: 1, note: "prose misread as Scripture" },
    ],
    failures,
  };
}
