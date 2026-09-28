import { expect, test } from "@playwright/test";
import { gotoReady, shot, signUp, slidePng, toneWav, waitForPack } from "./helpers";

test.describe("North-star flow", () => {
  test("YouTube sermon → notes → photo → Finish → Sermon Pack → Ask AI → Bible study → delete", async ({ page }, testInfo) => {
    await signUp(page, testInfo);
    await shot(page, testInfo, "01-home-empty");

    // New sermon from a public YouTube link.
    await gotoReady(page, "/sermons/new");
    await shot(page, testInfo, "02-new-sermon");
    await page.getByLabel("YouTube link").fill("not a link");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /doesn’t look like a link|doesn't look like a link/ })).toBeVisible();
    await page.getByLabel("YouTube link").fill("https://youtu.be/Fx7WaitSrm1");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForURL(/\/sermons\/[0-9a-f-]{36}$/);
    const sermonUrl = new URL(page.url()).pathname;
    await expect(page.locator("#sermon-player")).toBeVisible();

    // Notes: write, and see the local-first save confirm.
    await page.getByRole("link", { name: "Notes", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Sermon notes" });
    await editor.click();
    await page.keyboard.type("God works while I wait. Look up Romans 8:28 again.");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await shot(page, testInfo, "03-notes");

    // A photo of a slide.
    await gotoReady(page, `${sermonUrl}/photos`);
    await page.locator('input[type="file"][multiple]').setInputFiles({ name: "slide.png", mimeType: "image/png", buffer: await slidePng() });
    await expect(page.getByText("Uploaded", { exact: true })).toBeVisible();

    // Finish → staged processing → Sermon Pack.
    await gotoReady(page, sermonUrl);
    await page.getByRole("button", { name: "Finish sermon" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("What gets sent for analysis")).toBeVisible();
    await dialog.getByRole("button", { name: "Finish sermon" }).click();
    await waitForPack(page);
    await expect(page.getByText(/active expression of trust/).first()).toBeVisible();
    await expect(page.getByText("Test AI provider active")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Main ideas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sermon timeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scripture" })).toBeVisible();
    await expect(page.getByText("Romans 8:24–25").first()).toBeVisible();
    await expect(page.getByText("Romans 8:28").first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Sources" }).first()).toBeVisible();
    await shot(page, testInfo, "04-overview-pack");

    // A "Your note" citation opens the exact note block.
    const noteChip = page.getByRole("link", { name: /Your note/ }).first();
    await expect(noteChip).toHaveAttribute("href", /\/notes#block-/);

    // Correct an AI main idea; the correction is marked as the listener's.
    await page.getByRole("button", { name: "Correct main idea" }).first().click();
    await page.getByLabel("Main idea", { exact: true }).fill("Waiting is trust with its sleeves rolled up");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByRole("heading", { name: /Waiting is trust with its sleeves rolled up/ })).toBeVisible();
    await expect(page.getByText("edited by you").first()).toBeVisible();

    // Sermon tab: verbatim quotes carry evidence; paraphrases are labeled.
    await page.getByRole("link", { name: "Sermon", exact: true }).click();
    await expect(page.getByText("Paraphrase").first()).toBeVisible();
    await expect(page.getByText(/Heard word-for-word/).first()).toBeVisible();
    // Hiding an item is undoable.
    await page.getByRole("button", { name: "Hide paraphrase" }).first().click();
    await expect(page.getByText("Paraphrase hidden.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Paraphrase", { exact: true }).first()).toBeVisible();
    await shot(page, testInfo, "05-sermon-tab");

    // Ask AI with citations.
    await gotoReady(page, `${sermonUrl}/ask`);
    await page.getByLabel("Ask about this sermon").fill("What did I write about God working while I wait?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText("AI answer")).toBeVisible();
    await expect(page.getByRole("link", { name: /Your note/ }).first()).toBeVisible();
    await shot(page, testInfo, "06-ask");

    // Bible study.
    await gotoReady(page, `${sermonUrl}/study`);
    await page.getByRole("button", { name: "Create Bible study" }).click();
    await expect(page.getByRole("heading", { name: /15-minute study/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Verse text isn’t included").or(page.getByText("Verse text isn't included"))).toBeVisible();
    await shot(page, testInfo, "07-study");

    // Library search finds it by note text and by passage.
    await page.goto("/library?q=wait");
    await expect(page.getByText("Faith in the Waiting").first()).toBeVisible();
    await page.goto("/library?q=Romans%208");
    await expect(page.getByText("Faith in the Waiting").first()).toBeVisible();
    await shot(page, testInfo, "08-library");

    // Delete.
    await gotoReady(page, sermonUrl);
    await page.getByRole("button", { name: /More/ }).click();
    await page.getByRole("button", { name: "Delete sermon" }).click();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL("**/library");
    await expect(page.getByText("Faith in the Waiting")).toHaveCount(0);
  });

  test("uploaded recording plays, and timestamp chips seek it", async ({ page }, testInfo) => {
    await signUp(page, testInfo);
    await gotoReady(page, "/sermons/new");
    await page.getByLabel("I made this recording or have permission to upload and process it.").check();
    await page.locator('input[type="file"][accept^="audio"]').setInputFiles({ name: "sermon.wav", mimeType: "audio/wav", buffer: toneWav() });
    await page.waitForURL(/\/sermons\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const sermonUrl = new URL(page.url()).pathname;
    await expect(page.locator("audio")).toHaveCount(1);
    await page.getByRole("button", { name: "Finish sermon" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Finish sermon" }).click();
    await waitForPack(page);
    await page.goto(`${sermonUrl}/sermon`);
    await expect(page.locator("audio")).toHaveJSProperty("readyState", 4, { timeout: 20_000 }).catch(() => {});
    const chip = page.getByRole("button", { name: /Play from here/ }).first();
    await chip.click();
    await expect.poll(async () => page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0);
  });

  test("private YouTube videos explain the fallback options", async ({ page }, testInfo) => {
    await signUp(page, testInfo);
    await gotoReady(page, "/sermons/new");
    await page.getByLabel("YouTube link").fill("https://www.youtube.com/watch?v=Fx7Private1");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForURL(/\/sermons\/[0-9a-f-]{36}$/);
    const sermonUrl = new URL(page.url()).pathname;
    await page.goto(`${sermonUrl}/sermon`);
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(/This video can.t be analyzed directly from its YouTube URL\./).filter({ visible: true }).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.getByText(/upload a recording you have/).filter({ visible: true }).first()).toBeVisible();
    await shot(page, testInfo, "09-private-video");
  });
});

test.describe("Sunday Mode", () => {
  test("keeps notes and captures on the device while offline, then syncs", async ({ page, context }, testInfo) => {
    await signUp(page, testInfo);
    await gotoReady(page, "/sermons/new");
    await page.getByRole("button", { name: /Sunday Mode/ }).click();
    await page.waitForURL(/\/sunday$/);
    const sundayUrl = new URL(page.url()).pathname;
    const editor = page.getByRole("textbox", { name: "Sermon notes" });
    await expect(editor).toBeVisible();
    await shot(page, testInfo, "10-sunday");

    await context.setOffline(true);
    await editor.click();
    await page.keyboard.type("Offline thought: patience is trust over time.");
    await expect(page.getByText("Saved on this device").first()).toBeVisible();
    await page.getByRole("button", { name: "Bookmark" }).click();
    await expect(page.getByText("Bookmarked on this device")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 30_000 });
    await page.goto(sundayUrl.replace(/\/sunday$/, "/notes"));
    await expect(page.getByText("Offline thought: patience is trust over time.")).toBeVisible();
    await expect(page.getByText("Moments you marked")).toBeVisible({ timeout: 30_000 });
  });
});
