import { test, expect } from "./helpers/extension.js";
import { FIRST, PORT, THIRD } from "./helpers/env.js";

const loaded = (page, selector) => page.$eval(selector, (img) => img.complete && img.naturalWidth > 0);

// Requests the extension stopped, by host
function watchBlocked(page) {
  const blocked = [];
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText.includes("ERR_BLOCKED_BY_CLIENT")) blocked.push(request.url());
  });
  return blocked;
}

test.describe("user block list", () => {
  test("a bare domain becomes ||domain^ and blocks that site's requests", async ({ ext, page }) => {
    await ext.setBlockedUrls(["localhost"]);
    const [rule] = await ext.dynamicRules();
    expect(rule).toMatchObject({
      id: 1,
      action: { type: "block" },
      condition: { urlFilter: "||localhost^" },
    });
    expect(rule.condition.resourceTypes).toEqual(
      expect.arrayContaining(["image", "sub_frame", "script", "media", "xmlhttprequest"])
    );

    const blocked = watchBlocked(page);
    await page.goto(`${FIRST}/index.html`);
    await page.waitForLoadState("load");
    expect(await loaded(page, "#okimg")).toBe(true); // same-site image still loads
    expect(await loaded(page, "#adimg")).toBe(false);
    expect(blocked).toEqual(
      expect.arrayContaining([`${THIRD}/ad.png`, `${THIRD}/frame.html`])
    );
  });

  test("without a block list the same page loads everything", async ({ ext, page }) => {
    const blocked = watchBlocked(page);
    await page.goto(`${FIRST}/index.html`);
    await page.waitForLoadState("load");
    expect(await loaded(page, "#adimg")).toBe(true);
    expect(await page.frame({ url: `${THIRD}/frame.html` }).textContent("#marker")).toBe("frame loaded");
    expect(blocked).toEqual([]);
  });

  test("an entry with a path is matched as typed, not as a whole domain", async ({ ext, page }) => {
    await ext.setBlockedUrls([`localhost:${PORT}/ad.png`]);
    await page.goto(`${FIRST}/index.html`);
    await page.waitForLoadState("load");
    expect(await loaded(page, "#adimg")).toBe(false);
    // The rest of localhost still loads
    expect(await page.frame({ url: `${THIRD}/frame.html` }).textContent("#marker")).toBe("frame loaded");
  });

  test("one non-ASCII entry doesn't stop the rest of the list from blocking", async ({ ext, page }) => {
    await ext.setBlockedUrls(["bücher.example", "localhost"]);
    expect((await ext.dynamicRules()).map((r) => r.condition.urlFilter)).toEqual(["||localhost^"]);
    await page.goto(`${FIRST}/index.html`);
    await page.waitForLoadState("load");
    expect(await loaded(page, "#adimg")).toBe(false);
  });

  test("removing an entry lifts the block", async ({ ext, page }) => {
    await ext.setBlockedUrls(["localhost"]);
    await page.goto(`${FIRST}/index.html`);
    expect(await loaded(page, "#adimg")).toBe(false);
    await ext.setBlockedUrls([]);
    expect(await ext.dynamicRules()).toEqual([]);
    await page.reload();
    await page.waitForLoadState("load");
    expect(await loaded(page, "#adimg")).toBe(true);
  });
});

test.describe("blocked counter and badge", () => {
  const today = () => new Date().toLocaleDateString("en-CA");

  test("the badge shows today's stored count after blocks", async ({ ext, page }) => {
    await ext.setBlockedUrls(["localhost"]);
    await page.goto(`${FIRST}/index.html`);
    await page.waitForLoadState("load");

    // Logs are batched and written about a second later
    await expect
      .poll(async () => (await ext.getLocal("blockedToday")).blockedToday?.count ?? 0)
      .toBeGreaterThanOrEqual(2);
    const { blockedToday } = await ext.getLocal("blockedToday");
    expect(blockedToday.date).toBe(today());
    expect(await ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe(String(blockedToday.count));

    const logs = await ext.logUrls();
    expect(logs).toEqual(expect.arrayContaining([`${THIRD}/ad.png`, `${THIRD}/frame.html`]));
    const [entry] = (await ext.getLocal("blockedUrlLogs")).blockedUrlLogs;
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  test("yesterday's count starts over and big counts show as thousands", async ({ ext, page }) => {
    await ext.setLocal({ blockedToday: { date: "2000-01-01", count: 500 } });
    await ext.setBlockedUrls([`localhost:${PORT}/ad.png`]);
    await page.goto(`${FIRST}/index.html`);
    await expect.poll(async () => (await ext.getLocal("blockedToday")).blockedToday).toEqual({
      date: today(),
      count: 1,
    });
    expect(await ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("1");

    await ext.setLocal({ blockedToday: { date: today(), count: 1499 } });
    await page.reload();
    await expect.poll(async () => (await ext.getLocal("blockedToday")).blockedToday.count).toBe(1500);
    expect(await ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("1k");
  });

  test("the midnight alarm clears the badge and schedules the next one", async ({ ext, page }) => {
    await ext.setBlockedUrls([`localhost:${PORT}/ad.png`]);
    await page.goto(`${FIRST}/index.html`);
    await expect.poll(() => ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("1");

    // Fire the alarm now instead of waiting for midnight
    await ext.sw.evaluate(() => chrome.alarms.create("midnight", { when: Date.now() + 50 }));
    await expect.poll(() => ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
    await expect
      .poll(() => ext.sw.evaluate(async () => new Date((await chrome.alarms.get("midnight")).scheduledTime).getHours()))
      .toBe(0);
    const next = await ext.sw.evaluate(async () => (await chrome.alarms.get("midnight")).scheduledTime - Date.now());
    expect(next).toBeGreaterThan(1000);
  });

  test("the log keeps only the newest 100 entries", async ({ ext, page }) => {
    const old = Array.from({ length: 100 }, (_, i) => ({ timestamp: new Date(0).toISOString(), url: `old-${i}` }));
    await ext.setLocal({ blockedUrlLogs: old });
    await ext.setBlockedUrls([`localhost:${PORT}/ad.png`]);
    await page.goto(`${FIRST}/index.html`);
    await expect.poll(async () => (await ext.logUrls()).at(-1)).toBe(`${THIRD}/ad.png`);
    const logs = await ext.logUrls();
    expect(logs).toHaveLength(100);
    expect(logs[0]).toBe("old-1");
  });
});
