// The toolbar popup, opened as a tab. In a tab the active tab is the popup
// itself, so "Off on this site" is disabled; pause.spec.js covers the
// message the control sends.

import { test, expect } from "./helpers/extension.js";

const today = () => new Date().toLocaleDateString("en-CA");

test.describe("popup", () => {
  test.use({ viewport: { width: 360, height: 600 } });

  test("summarizes the lists and keeps the summary live", async ({
    ext,
    page,
  }) => {
    await ext.setSync({
      blockedUrls: ["connatix.com", "teads.tv"],
      pausedSites: ["example.org"],
    });
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#manageSummary")).toHaveText(
      "2 blocked URLs · 1 paused site",
    );

    await ext.setSync({ blockedUrls: ["connatix.com"], pausedSites: [] });
    await expect(page.locator("#manageSummary")).toHaveText(
      "1 blocked URL · 0 paused sites",
    );
  });

  test("shows the picker shortcut", async ({ ext, page }) => {
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#pickerShortcut")).toBeVisible();
    await expect(page.locator("#pickerShortcut")).toHaveText("Alt+Shift+K");
  });

  test("shows today's blocked count and follows it", async ({ ext, page }) => {
    await ext.setLocal({ blockedToday: { date: today(), count: 1234 } });
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#blockedToday")).toHaveText(
      "1,234 blocked today",
    );
    await ext.setLocal({ blockedToday: { date: today(), count: 1235 } });
    await expect(page.locator("#blockedToday")).toHaveText(
      "1,235 blocked today",
    );
    // A stale day shows zero
    await ext.setLocal({ blockedToday: { date: "2000-01-01", count: 9 } });
    await expect(page.locator("#blockedToday")).toHaveText("0 blocked today");
  });

  test("the manage button opens the settings page", async ({
    ext,
    page,
    context,
  }) => {
    await page.goto(ext.url("popup.html"));
    const opened = context.waitForEvent("page");
    await page.click("#manageButton");
    const options = await opened;
    await options.waitForLoadState();
    expect(options.url()).toBe(ext.url("options.html"));
  });

  test("the switches show the settings and write them", async ({
    ext,
    page,
  }) => {
    await ext.setSettings({ heavyAds: false });
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#videoAdRulesToggle")).toBeChecked();
    await expect(page.locator("#autoplayGuardToggle")).toBeChecked();
    await expect(page.locator("#heavyAdsToggle")).not.toBeChecked();
    await expect(page.locator("#annoyanceRulesToggle")).not.toBeChecked();

    await page.locator("#globalDefaults > summary").click();
    await page.locator("#extraProtections summary").click();
    await page.locator("#annoyanceRulesToggle").check();
    await page.locator("#autoplayGuardToggle").uncheck();
    await expect
      .poll(async () => (await ext.getSync("settings")).settings)
      .toEqual({
        videoAdRules: true,
        autoplayGuard: false,
        heavyAds: false,
        annoyanceRules: true,
        notificationRules: false,
        adChurnRules: false,
        refreshThrottle: false,
        adRedirectGuard: false,
        aggressiveHeavyAds: false,
      });
    // The worker applies them
    await expect
      .poll(() => ext.enabledRulesets())
      .toEqual(["annoyances", "video_ads"]);
    await expect.poll(() => ext.registeredScripts()).toEqual(["cosmetic"]);
  });

  test("blocks a typed URL, normalized, and flags a repeat", async ({
    ext,
    page,
  }) => {
    await page.goto(ext.url("popup.html"));
    await page.fill("#urlInput", "  https://www.ads.example.com/  ");
    await page.press("#urlInput", "Enter");
    await expect
      .poll(() => ext.getSync("blockedUrls"))
      .toEqual({ blockedUrls: ["ads.example.com"] });
    await expect(page.locator("#urlInput")).toHaveValue("");
    await expect(page.locator("#manageSummary")).toHaveText(
      "1 blocked URL · 0 paused sites",
    );

    await page.fill("#urlInput", "ads.example.com");
    await page.click("#addButton");
    await expect(page.locator("#statusMessage")).toHaveText(
      "This URL is already blocked.",
    );
    await expect(page.locator("#urlInput")).toHaveValue("ads.example.com");
  });

  test("the picker button explains when the page can't be picked", async ({
    ext,
    page,
  }) => {
    // The active tab is the popup itself, an extension page
    await page.goto(ext.url("popup.html"));
    await page.click("#selectorButton");
    await expect(page.locator("#statusMessage")).toHaveText(
      "The selector can't run on this page.",
    );
  });

  test("the power control shows the state and disables this-site off web pages", async ({
    ext,
    page,
  }) => {
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#blockedToday")).toBeVisible();
    await expect(page.locator('input[name="power"][value="on"]')).toBeChecked();
    await expect(
      page.locator('input[name="power"][value="site"]'),
    ).toBeDisabled();
    await expect(page.locator("#powerDesc")).toHaveText(
      "Blocking on every site.",
    );

    // Turned off from another window, the popup follows
    await ext.setSync({ pausedEverywhere: true });
    await expect(
      page.locator('input[name="power"][value="everywhere"]'),
    ).toBeChecked();
    await expect(page.locator("#powerDesc")).toHaveText(
      "Nothing is blocked on any site.",
    );

    await page.locator('label:has(input[name="power"][value="on"])').click();
    await expect
      .poll(() => ext.getSync("pausedEverywhere"))
      .toEqual({ pausedEverywhere: false });
    await expect(page.locator("#powerDesc")).toHaveText(
      "Blocking on every site.",
    );
  });

  test("fits under 600px with a long site name", async ({ ext, page }) => {
    await page.goto(ext.url("popup.html"));
    await expect(page.locator("#blockedToday")).toBeVisible();
    // Worst case: the longest description, as it is on a web page
    await page.evaluate(() => {
      document.getElementById("powerDesc").innerHTML =
        "Blocking on <b>www.a-rather-long-site-name.example.com</b>. Changes reload the tab.";
    });
    // With a short viewport, scrollHeight is the content's own height
    await page.setViewportSize({ width: 360, height: 100 });
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    expect(height).toBeGreaterThan(300); // measured the content, not the viewport
    expect(height).toBeLessThan(600);
  });
});
