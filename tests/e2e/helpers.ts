import { expect, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";

export async function signUp(page: Page, testInfo: TestInfo) {
  const email = `e2e-${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/home");
  return email;
}

export async function slidePng(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#fff"/><text x="80" y="200" font-size="80" font-family="sans-serif">Faith in the Waiting</text><text x="80" y="320" font-size="56" font-family="sans-serif">Romans 8:24-25</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A 3-second 8 kHz mono PCM WAV tone. */
export function toneWav(seconds = 3): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

export async function waitForPack(page: Page) {
  await expect(page.getByRole("heading", { name: "Big idea" })).toBeVisible({ timeout: 90_000 });
  // Search indexing finishes right after the pack; the header says so when nothing is running.
  await expect(page.getByText(/Sermon Pack ready/)).toBeVisible({ timeout: 60_000 });
}

export async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

/** Navigates and waits until the page is hydrated and quiet, so client handlers are attached. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
