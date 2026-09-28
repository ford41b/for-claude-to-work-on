import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

/**
 * Evaluation runner.
 *
 *   npm run eval                          # scripture + grounding (offline) + model (if a provider is configured)
 *   npm run eval -- --suite=scripture     # one suite
 *   npm run eval -- --provider=gemini     # model suite against Gemini (needs GEMINI_API_KEY)
 *   npm run eval -- --provider=fixture    # model suite against the synthetic provider (harness check only)
 *   npm run eval -- --json=evals/results/run.json
 *
 * Exits non-zero when an enforced metric misses its target. Model metrics from the synthetic
 * provider are advisory: they show the harness works, not that a model is good.
 */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

async function main() {
  const { printResult, suitePasses } = await import("./lib");
  const { runScriptureSuite } = await import("./suites/scripture");
  const { runGroundingSuite } = await import("./suites/grounding");
  const { resolveProvider, runModelSuite } = await import("./suites/model");

  const wanted = new Set((arg("suite") ?? "scripture,grounding,model").split(",").map((s) => s.trim()));
  const results: Awaited<ReturnType<typeof runModelSuite>>[] = [];
  const advisory = new Set<string>();

  if (wanted.has("scripture")) results.push(runScriptureSuite());
  if (wanted.has("grounding")) results.push(runGroundingSuite());
  if (wanted.has("model")) {
    const { provider, reason } = resolveProvider(arg("provider"));
    if (!provider) {
      results.push({ suite: "model", description: "Sermon Pack synthesis and grounded Ask AI", metrics: [], failures: [], skipped: reason });
    } else {
      const r = await runModelSuite(provider);
      if (provider.id === "fixture") {
        r.description += " — SYNTHETIC provider, advisory only";
        advisory.add("model");
      }
      results.push(r);
    }
  }

  for (const r of results) printResult(r);

  const enforced = results.filter((r) => !advisory.has(r.suite));
  const failed = enforced.filter((r) => !suitePasses(r));
  const summary = results.map((r) => `${r.suite}: ${r.skipped ? "skipped" : suitePasses(r) ? "pass" : advisory.has(r.suite) ? "below target (advisory)" : "FAIL"}`);
  console.warn(`\n${summary.join("  ·  ")}`);

  const jsonPath = arg("json") ?? (wanted.has("model") && results.some((r) => r.suite === "model" && !r.skipped) ? join("evals", "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`) : undefined);
  if (jsonPath) {
    mkdirSync(join(jsonPath, ".."), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 2));
    console.warn(`report written to ${jsonPath}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
