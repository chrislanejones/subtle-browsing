// The settings page (options.html)

import { test, expect } from "./helpers/extension.js";
import { readFile } from "node:fs/promises";

// The version under test, so a version bump doesn't break these checks
const { version } = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

const rows = (page, list) => page.locator(`#${list} .url-item span`);
const jsonFile = (name, value) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),
});

test.describe("settings page", () => {
  test.beforeEach(async ({ ext, page }) => {
    await ext.setSync({ blockedUrls: ["connatix.com", "teads.tv", "primis.tech"], pausedSites: ["example.org"] });
    await page.goto(ext.url("options.html"));
  });

  test("shows the version, the lists newest first and the shortcut", async ({ page }) => {
    await expect(page.locator("#version")).toHaveText(`Version ${version}`);
    await expect(rows(page, "urlList")).toHaveText(["primis.tech", "teads.tv", "connatix.com"]);
    await expect(page.locator("#blockedCount")).toHaveText("3 total");
    await expect(rows(page, "pausedList")).toHaveText(["example.org"]);
    await expect(page.locator("#pausedCount")).toHaveText("1 total");
    await expect(page.locator("#shortcutDesc kbd")).toHaveText("Alt+Shift+K");
  });

  test("adds a URL with Enter or the button, normalized", async ({ ext, page }) => {
    await page.fill("#urlInput", "https://www.anyclip.com/");
    await page.press("#urlInput", "Enter");
    await expect(rows(page, "urlList").first()).toHaveText("anyclip.com");
    await page.fill("#urlInput", "vdo.ai");
    await page.click("#addButton");
    await expect(rows(page, "urlList").first()).toHaveText("vdo.ai");
    expect((await ext.getSync("blockedUrls")).blockedUrls).toEqual([
      "connatix.com",
      "teads.tv",
      "primis.tech",
      "anyclip.com",
      "vdo.ai",
    ]);
    await expect(page.locator("#blockedCount")).toHaveText("5 total");

    await page.fill("#urlInput", "teads.tv");
    await page.click("#addButton");
    await expect(page.locator("#blockedStatus")).toHaveText("This URL is already blocked.");
  });

  test("the search box filters the list", async ({ page }) => {
    await page.fill("#searchInput", "TEA");
    await expect(rows(page, "urlList")).toHaveText(["teads.tv"]);
    await expect(page.locator("#blockedCount")).toHaveText("1 of 3");
    await page.fill("#searchInput", "nothing-like-this");
    await expect(page.locator("#urlList .empty")).toHaveText("Nothing matches.");
    await expect(page.locator("#blockedCount")).toHaveText("0 of 3");
    await page.fill("#searchInput", "");
    await expect(rows(page, "urlList")).toHaveCount(3);
  });

  test("removes a URL and unpauses a site", async ({ ext, page }) => {
    await page.getByRole("button", { name: "Remove teads.tv" }).click();
    await expect(rows(page, "urlList")).toHaveText(["primis.tech", "connatix.com"]);
    expect(await ext.getSync("blockedUrls")).toEqual({ blockedUrls: ["connatix.com", "primis.tech"] });

    await page.getByRole("button", { name: "Unpause example.org" }).click();
    await expect(page.locator("#pausedList .empty")).toHaveText("No paused sites.");
    expect(await ext.getSync("pausedSites")).toEqual({ pausedSites: [] });
  });

  test("the switches follow changes made elsewhere and write their own", async ({ ext, page }) => {
    await expect(page.locator("#annoyanceRulesToggle")).not.toBeChecked();
    await ext.setSettings({ annoyanceRules: true });
    await expect(page.locator("#annoyanceRulesToggle")).toBeChecked();

    await page.locator("#videoAdRulesToggle").uncheck();
    await expect.poll(() => ext.enabledRulesets()).toEqual(["annoyances"]);
  });

  test("exports a dated backup of the lists and switches", async ({ page }, testInfo) => {
    const downloading = page.waitForEvent("download");
    await page.click("#exportButton");
    const download = await downloading;

    const [year, month, day] = new Date().toLocaleDateString("en-CA").split("-");
    expect(download.suggestedFilename()).toBe(`url-blocker-backup-${month}-${day}-${year}.json`);
    const path = testInfo.outputPath("backup.json");
    await download.saveAs(path);
    const backup = JSON.parse(await readFile(path, "utf8"));
    expect(backup).toEqual({
      app: "subtle-browsing",
      version,
      exportedAt: expect.any(String),
      blockedUrls: ["connatix.com", "teads.tv", "primis.tech"],
      pausedSites: ["example.org"],
      settings: { videoAdRules: true, autoplayGuard: true, heavyAds: true, annoyanceRules: false },
    });
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    await expect(page.locator("#backupStatus")).toHaveText("Backup saved to your downloads.");
  });

  test("importing merges, normalizes and ignores junk", async ({ ext, page }) => {
    await page.setInputFiles(
      "#importFile",
      jsonFile("backup.json", {
        blockedUrls: ["teads.tv", "https://www.anyclip.com/", 42, "   ", null],
        pausedSites: [" WWW.News.Example ", 7],
        settings: { annoyanceRules: true, heavyAds: "no", bogus: true },
      })
    );
    await expect(page.locator("#backupStatus")).toHaveText("Imported 1 URLs and 1 paused sites.");
    expect(await ext.getSync()).toEqual({
      blockedUrls: ["connatix.com", "teads.tv", "primis.tech", "anyclip.com"],
      pausedSites: ["example.org", "news.example"],
      settings: { videoAdRules: true, autoplayGuard: true, heavyAds: true, annoyanceRules: true },
    });
    // The page and the worker both pick it up
    await expect(rows(page, "urlList").first()).toHaveText("anyclip.com");
    await expect(page.locator("#annoyanceRulesToggle")).toBeChecked();
    await expect.poll(() => ext.enabledRulesets()).toEqual(["annoyances", "video_ads"]);
    await expect
      .poll(async () => (await ext.dynamicRules()).find((r) => r.action.type === "allowAllRequests")?.condition.requestDomains)
      .toEqual(["example.org", "news.example"]);

    // The same file again adds nothing
    await page.setInputFiles(
      "#importFile",
      jsonFile("backup.json", { blockedUrls: ["anyclip.com"], pausedSites: ["news.example"] })
    );
    await expect(page.locator("#backupStatus")).toHaveText("Imported 0 URLs and 0 paused sites.");
  });

  test("rejects a file that isn't JSON, or has nothing usable", async ({ ext, page }) => {
    const before = await ext.getSync();
    await page.setInputFiles("#importFile", jsonFile("notes.json", "not json at all"));
    await expect(page.locator("#backupStatus")).toHaveText("That file isn't a URL Blocker backup.");

    await page.locator("#backupStatus").evaluate((el) => (el.textContent = ""));
    await page.setInputFiles("#importFile", jsonFile("other.json", { hello: "world", settings: { bogus: true } }));
    await expect(page.locator("#backupStatus")).toHaveText("That file isn't a URL Blocker backup.");
    expect(await ext.getSync()).toEqual(before);
  });

  test("the import count matches what was added", async ({ ext, page }) => {
    await page.setInputFiles(
      "#importFile",
      jsonFile("backup.json", { blockedUrls: ["vdo.ai", "https://vdo.ai/", "www.vdo.ai"] })
    );
    await expect.poll(async () => (await ext.getSync("blockedUrls")).blockedUrls).toContain("vdo.ai");
    expect((await ext.getSync("blockedUrls")).blockedUrls.filter((u) => u === "vdo.ai")).toHaveLength(1);
    await expect(page.locator("#backupStatus")).toHaveText("Imported 1 URLs and 0 paused sites.", { timeout: 2000 });
  });
});
