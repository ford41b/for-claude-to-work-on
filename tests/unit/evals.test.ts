import { describe, expect, it } from "vitest";
import { metricPasses } from "../../evals/lib";
import { runGroundingSuite } from "../../evals/suites/grounding";
import { runScriptureSuite } from "../../evals/suites/scripture";

// The offline eval suites run with the unit tests so a regression in Scripture detection or
// citation enforcement fails CI, not just `npm run eval`.
describe("offline evals", () => {
  it.each([
    ["scripture", runScriptureSuite],
    ["grounding", runGroundingSuite],
  ] as const)("%s suite meets its targets", (_name, run) => {
    const result = run();
    const missed = result.metrics.filter((m) => !metricPasses(m)).map((m) => `${m.name}=${m.value}`);
    expect(missed).toEqual([]);
    expect(result.failures.filter((f) => !f.known)).toEqual([]);
  });
});
