import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

// Jetpack's masthead on foxnews.com turns position: fixed as you scroll and
// covers the top of the article. tests/site/pinned.html copies its shape.
const position = (page, id) =>
  page.evaluate((id) => getComputedStyle(document.getElementById(id)).position, id);
const ads = ["jpmasthead", "google_ads_iframe_/1/site/oop_0__container__", "otherAd"];

async function scrolled(page) {
  await page.goto(`${FIRST}/pinned.html`);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => document.getElementById("jpmasthead").className)).toBe("jpfixed");
}

test.describe("pinned ads", () => {
  test("are on by default: ads scroll away, the site's own header stays pinned", async ({ ext, page }) => {
    await scrolled(page);
    for (const id of ads) await expect.poll(() => position(page, id)).toBe("absolute");
    expect(await position(page, "siteHeader")).toBe("fixed");
    // The article, not the ad, is at the top of the window
    expect(await page.evaluate(() => document.elementFromPoint(100, 100).tagName)).toBe("ARTICLE");
  });

  test("off, ads stay pinned", async ({ ext, page }) => {
    await ext.setSettings({ pinnedAds: false });
    await scrolled(page);
    for (const id of ads) expect(await position(page, id)).toBe("fixed");
  });

  test("a site turned off is left alone, and turning it back on applies live", async ({ ext, page }) => {
    await ext.setSync({ siteSettings: { "127.0.0.1": { pinnedAds: false } } });
    await scrolled(page);
    expect(await position(page, "jpmasthead")).toBe("fixed");
    await ext.setSync({ siteSettings: {} });
    await expect.poll(() => position(page, "jpmasthead")).toBe("absolute");
  });
});
