// The settings page overview: totals, charts and the "What gets blocked"
// table, fed by the daily blockStats the worker keeps

import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

const today = () => new Date().toLocaleDateString("en-CA");
const daysAgo = (n) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toLocaleDateString("en-CA");
};

test("a block is counted by type, blocked domain and the site it was on", async ({ ext, page }) => {
  await ext.setBlockedUrls(["localhost"]);
  await page.goto(`${FIRST}/pause.html`);
  await expect
    .poll(async () => (await ext.getLocal("blockStats")).blockStats?.[today()])
    .toEqual({ types: { personal: 1 }, hosts: { localhost: 1 }, pages: { "127.0.0.1": 1 } });
  const [entry] = (await ext.getLocal("blockedUrlLogs")).blockedUrlLogs;
  expect(entry).toMatchObject({ type: "personal", host: "localhost", page: "127.0.0.1" });
});

test("days past 30 are dropped when the stats are written", async ({ ext, page }) => {
  await ext.setLocal({ blockStats: { [daysAgo(29)]: { types: { video_ads: 1 }, hosts: {}, pages: {} }, [daysAgo(30)]: { types: { video_ads: 1 }, hosts: {}, pages: {} } } });
  await ext.setBlockedUrls(["localhost"]);
  await page.goto(`${FIRST}/pause.html`);
  await expect.poll(async () => Object.keys((await ext.getLocal("blockStats")).blockStats).sort()).toEqual([daysAgo(29), today()].sort());
});

test.describe("overview", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows totals, charts by type and domain, and the table of what gets blocked", async ({ ext, page }) => {
    await ext.setSync({ blockedUrls: ["connatix.com", "teads.tv"], pausedSites: ["example.org"] });
    await ext.setLocal({
      blockedToday: { date: today(), count: 12 },
      blockStats: {
        [today()]: { types: { video_ads: 9, personal: 3 }, hosts: { "connatix.com": 8, "teads.tv": 4 }, pages: { "variety.com": 12 } },
        [daysAgo(3)]: { types: { ad_churn: 20 }, hosts: { "sync.cootlogix.com": 20 }, pages: { "variety.com": 20 } },
        [daysAgo(20)]: { types: { video_ads: 100 }, hosts: {}, pages: {} },
      },
    });
    await page.goto(ext.url("options.html"));

    const tiles = page.locator("#tiles .tile");
    await expect(tiles.locator(".tile-label")).toHaveText(["Blocked today", "Last 7 days", "Last 30 days", "Your blocked URLs", "Paused sites", "Hidden elements"]);
    await expect(tiles.locator(".tile-value")).toHaveText(["12", "32", "132", "2", "1", "0"]);
    await expect(page.locator("#powerState")).toHaveText("Blocking is on");

    // 14 day columns; today's holds both of its types
    await expect(page.locator("#perDay .col-bar")).toHaveCount(14);
    await expect(page.locator("#perDay .col-bar").last()).toHaveAttribute("aria-label", /: 12 blocked$/);
    await expect(page.locator("#perDay .col-bar").last().locator(".seg")).toHaveCount(2);

    await expect(page.locator("#byType .bar-name")).toHaveText(["Ad refresh and sync", "Video ads", "Your list"]);
    await expect(page.locator("#byType .bar-value")).toHaveText(["20", "9", "3"]);
    await expect(page.locator("#topHosts .bar-name")).toHaveText(["sync.cootlogix.com", "connatix.com", "teads.tv"]);
    await expect(page.locator("#topPages .bar-name")).toHaveText(["variety.com"]);
    await expect(page.locator("#topPages .bar-value")).toHaveText(["32"]);

    // Hovering a bar shows its numbers
    await page.locator("#byType li").first().hover();
    await expect(page.locator(".viz-tooltip")).toBeVisible();
    await expect(page.locator(".viz-tooltip")).toContainText("20 blocked");

    const kinds = page.locator("#kinds tr");
    await expect(kinds).toHaveCount(10);
    await expect(kinds.first()).toContainText("Video ad companies");
    await expect(kinds.first()).toContainText("19 rules");
    await expect(kinds.first().locator(".state")).toHaveText("On");
    await expect(kinds.nth(1)).toContainText("2 URLs");
    await expect(kinds.nth(2)).toContainText("30 rules");
    await expect(kinds.nth(2).locator(".state")).toHaveText("Off");
    await expect(kinds.nth(2).locator("td.num")).toHaveText("20");

    // Live: a setting change updates the table
    await ext.setSettings({ adChurnRules: true });
    await expect(kinds.nth(2).locator(".state")).toHaveText("On");
    await ext.setSync({ pausedEverywhere: true });
    await expect(page.locator("#powerState")).toHaveText("Off everywhere");
  });

  test("with nothing counted yet, the charts say so and the page fills the window", async ({ ext, page }) => {
    await page.goto(ext.url("options.html"));
    await expect(page.locator("#perDay")).toHaveText("Nothing blocked yet in the last 14 days.");
    await expect(page.locator("#recent")).toHaveText("Nothing blocked yet.");
    const width = await page.locator(".grid-2").evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  });
});
