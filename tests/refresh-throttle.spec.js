import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

// Calls refresh() for every slot and returns how many slot lists reached the
// ad tag stand-in in refresh.html
const refreshAll = (page) =>
  page.evaluate(() => {
    const before = window.calls.length;
    googletag.pubads().refresh();
    return window.calls.length - before;
  });

test.describe("slow ad refresh", () => {
  test("is off by default, so every refresh reaches the ad tag", async ({ ext, page }) => {
    expect(await ext.registeredScripts()).not.toContain("refresh-throttle");
    await page.goto(`${FIRST}/refresh.html`);
    for (let i = 0; i < 3; i++) expect(await refreshAll(page)).toBe(1);
  });

  test("lets each slot load once, then holds repeat refreshes", async ({ ext, page }) => {
    await ext.setSettings({ refreshThrottle: true });
    await page.goto(`${FIRST}/refresh.html`);
    // Once the site's policy arrives, a repeat refresh no longer gets through
    await expect.poll(() => refreshAll(page)).toBe(0);
    expect(await page.evaluate(() => window.calls[0])).toEqual(["a", "b"]);

    // A new slot still gets its first load, and only it is sent
    const sent = await page.evaluate(() => {
      window.defineSlot("c");
      googletag.pubads().refresh(googletag.pubads().getSlots());
      return window.calls.at(-1);
    });
    expect(sent).toEqual(["c"]);
    expect(await refreshAll(page)).toBe(0);
  });

  test("a slot whose box is replaced gets its first load again", async ({ ext, page }) => {
    await ext.setSettings({ refreshThrottle: true });
    await page.goto(`${FIRST}/refresh.html`);
    await expect.poll(() => refreshAll(page)).toBe(0);

    // Like an infinite-scroll page reusing slot "a" for the next article
    const sent = await page.evaluate(() => {
      document.getElementById("a").replaceWith(Object.assign(document.createElement("div"), { id: "a" }));
      googletag.pubads().refresh();
      return window.calls.at(-1);
    });
    expect(sent).toEqual(["a"]);
    expect(await refreshAll(page)).toBe(0);
  });

  test("a site turned off is left alone", async ({ ext, page }) => {
    await ext.setSettings({ refreshThrottle: true });
    await ext.setSync({ siteSettings: { "127.0.0.1": { refreshThrottle: false } } });
    await page.goto(`${FIRST}/refresh.html`);
    await page.waitForTimeout(500); // time for the policy to arrive
    for (let i = 0; i < 3; i++) expect(await refreshAll(page)).toBe(1);
  });
});
