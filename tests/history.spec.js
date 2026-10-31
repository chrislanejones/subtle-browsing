import { test, expect } from "./helpers/extension.js";

const dateAgo = (n) => { const day = new Date(); day.setDate(day.getDate() - n); return day.toLocaleDateString("en-CA"); };

test("migration rolls back on transaction failure, retries cleanup and preserves newer counts", async ({ ext }) => {
  const page = await ext.messenger();
  const result = await page.evaluate(async () => {
    const history = await import("./history.js");
    const date = history.localDate();
    const legacy = { [`stats-${date}`]: { types: { personal: 7 }, hosts: {}, pages: {} } };
    const get = chrome.storage.local.get.bind(chrome.storage.local);
    const remove = chrome.storage.local.remove.bind(chrome.storage.local);
    const put = IDBObjectStore.prototype.put;
    let removed = false;
    chrome.storage.local.get = async () => legacy;
    chrome.storage.local.remove = async () => { removed = true; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = Reflect.apply(put, this, args);
      if (this.name === "days") this.transaction.abort();
      return request;
    };
    try {
      let aborted;
      try { await history.migrateHistory(); } catch (error) { aborted = error.message; }
      IDBObjectStore.prototype.put = put;
      const afterAbort = await new Promise((resolve, reject) => {
        const request = indexedDB.open("url-blocker-history");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("days");
          const count = tx.objectStore("days").count();
          tx.oncomplete = () => { db.close(); resolve(count.result); };
        };
      });
      const removedAfterAbort = removed;
      chrome.storage.local.remove = async () => { throw new Error("Interrupted cleanup"); };
      // A count after a failed initial migration must retry that migration.
      try { await history.appendHistory([{ timestamp: new Date().toISOString(), type: "personal" }], "before-cleanup"); } catch {}
      await history.appendHistory([{ timestamp: new Date().toISOString(), type: "personal", host: "new.example" }], "new-count");
      chrome.storage.local.remove = async () => { removed = true; };
      await history.migrateHistory();
      return { aborted, afterAbort, removedAfterAbort, removed, final: (await history.readHistory())[date] };
    } finally {
      IDBObjectStore.prototype.put = put;
      chrome.storage.local.get = get; chrome.storage.local.remove = remove;
    }
  });
  expect(result.aborted).toBeTruthy();
  expect(result.afterAbort).toBe(0);
  expect(result.removedAfterAbort).toBe(false);
  expect(result.removed).toBe(true);
  expect(result.final).toEqual({ types: { personal: 8 }, hosts: { "new.example": 1 }, pages: {} });
});

test("history supports 90-day range selection and rejects malformed dates", async ({ ext, page }) => {
  await ext.setLocal({
    [`stats-${dateAgo(89)}`]: { types: { personal: 123 }, hosts: {}, pages: {} },
    [`stats-${dateAgo(90)}`]: { types: { personal: 999 }, hosts: {}, pages: {} },
    "stats-2026-99-99": { types: { personal: 999 }, hosts: {}, pages: {} },
  });
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#perDay")).toContainText("Nothing blocked yet in the last 14 days");
  await page.getByRole("combobox", { name: "History range" }).selectOption("90");
  await expect(page.locator("#perDay .col-bar")).toHaveCount(90);
  await expect(page.locator("#perDay .col-bar").first()).toHaveAttribute("aria-label", /123 blocked$/);
  await page.locator("#perDay summary").click();
  await expect(page.locator("#perDay tbody tr")).toHaveCount(90);
  const history = await ext.sendMessage({ action: "getHistory" });
  expect(Object.keys(history.days)).toEqual([dateAgo(89)]);
  expect((await ext.sendMessage({ action: "getHistory", from: "2026-99-99" })).error).toContain("valid history");
  expect(Object.keys(await ext.getLocal()).filter((key) => key.startsWith("stats-"))).toEqual([]);
});

test("independent extension windows append counts without lost updates; immediate retry is idempotent", async ({ ext, context }) => {
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(pages.map((page) => page.goto(ext.url("popup.html"))));
  await Promise.all(pages.map((page, i) => page.evaluate(async (i) => {
    const { appendHistory } = await import("./history.js");
    for (let n = 0; n < 10; n++) await appendHistory([{ timestamp: new Date().toISOString(), type: "personal", host: `page-${i}.example` }], `${i}-${n}`);
  }, i)));
  const history = await ext.sendMessage({ action: "getHistory" });
  expect(history.days[dateAgo(0)]).toEqual({ types: { personal: 20 }, hosts: { "page-0.example": 10, "page-1.example": 10 }, pages: {} });
  await pages[0].evaluate(async () => {
    const { appendHistory } = await import("./history.js");
    const batch = [{ timestamp: new Date().toISOString(), type: "heavy" }];
    await appendHistory(batch, "retry"); await appendHistory(batch, "retry");
  });
  expect((await ext.sendMessage({ action: "getHistory" })).days[dateAgo(0)].types).toEqual({ personal: 20, heavy: 1 });
});

for (const width of [360, 640])
  test(`tables at ${width}px keep labels, long domains and counts within the window`, async ({ ext, page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const host = `${"long-ad-host-".repeat(12)}.example`;
    await ext.setLocal({
      blockedUrlLogs: [{ timestamp: new Date().toISOString(), type: "video_ads", url: `https://${host}/advertisement`, host, page: host }],
      [`stats-${dateAgo(0)}`]: { types: { video_ads: 1234567 }, hosts: { [host]: 1234567 }, pages: { [host]: 1234567 } },
    });
    await page.goto(ext.url("options.html"));
    await page.getByRole("combobox", { name: "History range" }).selectOption("90");
    await expect(page.locator("#perDay .col-bar")).toHaveCount(90);
    await page.locator("#perDay summary").click();
    await expect(page.getByRole("table")).toHaveCount(3);
    await expect(page.locator("#kinds tr").first().locator('[data-label="Status"]')).toHaveText("On");
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      recent: document.querySelector("#recent").scrollWidth,
      labels: getComputedStyle(document.querySelector('#recent [data-label="Blocked"]'), "::before").content,
      display: getComputedStyle(document.querySelector("#kinds tr")).display,
    }));
    expect(layout.width).toBe(width);
    expect(layout.recent).toBeLessThan(width);
    expect(layout.labels).toBe('"Blocked"');
    expect(layout.display).toBe("block");
    await page.locator("#kindsHeading").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`tables-${width}.png`) });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: testInfo.outputPath(`tables-${width}-dark.png`) });
  });
