import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the production build against the local Supabase stack with the
 * synthetic test AI provider (no network, deterministic output) and a separate job worker.
 *   npm run build && npm run test:e2e
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const testEnv = {
  AI_PROVIDER: "fixture",
  ALLOW_FIXTURE_AI: "true",
  YOUTUBE_METADATA: "off",
  NEXT_PUBLIC_SITE_URL: baseURL,
  LOG_LEVEL: "warn",
};
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: executablePath ? { executablePath } : undefined } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: executablePath ? { executablePath } : undefined } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `${baseURL}/sign-in`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: testEnv,
    },
    {
      command: "npm run worker",
      port: 3199,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...testEnv, WORKER_HEALTH_PORT: "3199", WORKER_CONCURRENCY: "4" },
    },
  ],
});
