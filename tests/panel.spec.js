// The DevTools panel (panel.html), opened as a tab. chrome.devtools only
// exists inside DevTools, so the picker buttons aren't clicked here.

import { test, expect } from "./helpers/extension.js";
import { FIRST, PORT, THIRD } from "./helpers/env.js";

const logRows = (page) => page.locator("#logsContainer .log-url");
const entry = (url, second) => ({ timestamp: new Date(Date.UTC(2026, 0, 1, 12, 0, second)).toISOString(), url });

test.describe("DevTools panel", () => {
  test("adds and removes URLs", async ({ ext, page }) => {
    await page.goto(ext.url("panel.html"));
    await expect(page.locator("#blockedUrlsList .empty")).toHaveText("No URLs blocked yet.");
    await page.fill("#urlInput", "https://www.teads.tv/");
    await page.press("#urlInput", "Enter");
    await expect(page.locator("#blockedUrlsList .url-row span")).toHaveText(["teads.tv"]);
    expect(await ext.getSync("blockedUrls")).toEqual({ blockedUrls: ["teads.tv"] });

    await page.fill("#urlInput", "teads.tv");
    await page.click("#addButton");
    await expect(page.locator("#statusMessage")).toHaveText("This URL is already blocked.");

    await page.getByRole("button", { name: "Remove teads.tv" }).click();
    await expect(page.locator("#blockedUrlsList .empty")).toBeVisible();
    expect(await ext.getSync("blockedUrls")).toEqual({ blockedUrls: [] });
  });

  test("shows ten URLs until asked for all", async ({ ext, page }) => {
    const urls = Array.from({ length: 12 }, (_, i) => `ad${i}.example`);
    await ext.setSync({ blockedUrls: urls });
    await page.goto(ext.url("panel.html"));
    await expect(page.locator("#blockedUrlsList .url-row")).toHaveCount(10);
    await page.getByRole("button", { name: "Show all URLs (12)" }).click();
    await expect(page.locator("#blockedUrlsList .url-row")).toHaveCount(12);
    await page.getByRole("button", { name: "Show fewer URLs" }).click();
    await expect(page.locator("#blockedUrlsList .url-row")).toHaveCount(10);
  });

  test("renders the log newest first and clears it", async ({ ext, page }) => {
    await ext.setLocal({ blockedUrlLogs: [entry("https://a.example/1", 1), entry("https://b.example/2", 2)] });
    await page.goto(ext.url("panel.html"));
    await expect(logRows(page)).toHaveText(["https://b.example/2", "https://a.example/1"]);
    await expect(page.locator("#logCount")).toHaveText("2");
    await expect(page.locator("#noLogsMessage")).toBeHidden();

    await page.click("#clearLogsButton");
    await expect(page.locator("#noLogsMessage")).toBeVisible();
    await expect(page.locator("#logsContainer")).toBeHidden();
    await expect(page.locator("#logCount")).toHaveText("");
    expect(await ext.getLocal("blockedUrlLogs")).toEqual({ blockedUrlLogs: [] });
  });

  test("real blocks show up in the log as they happen", async ({ ext, page, context }) => {
    await page.goto(ext.url("panel.html"));
    await expect(page.locator("#noLogsMessage")).toBeVisible();
    await ext.setBlockedUrls([`localhost:${PORT}/ad.png`]);
    const site = await context.newPage();
    await site.goto(`${FIRST}/index.html`);
    await expect(logRows(page)).toHaveText([`${THIRD}/ad.png`]);
  });

  test("skips drawing while hidden and catches up when shown", async ({ ext, page }) => {
    await ext.setLocal({ blockedUrlLogs: [entry("https://a.example/1", 1)] });
    await page.goto(ext.url("panel.html"));
    await expect(logRows(page)).toHaveText(["https://a.example/1"]);

    // devtools.js calls this when another DevTools tab comes to the front
    await page.evaluate(() => window.setPanelShown(false));
    await ext.setLocal({ blockedUrlLogs: [entry("https://a.example/1", 1), entry("https://b.example/2", 2)] });
    await page.click("#refreshButton"); // even a refresh waits
    await page.waitForTimeout(500);
    await expect(logRows(page)).toHaveText(["https://a.example/1"]);
    await expect(page.locator("#logCount")).toHaveText("1");

    await page.evaluate(() => window.setPanelShown(true));
    await expect(logRows(page)).toHaveText(["https://b.example/2", "https://a.example/1"]);
    await expect(page.locator("#logCount")).toHaveText("2");
  });
});
