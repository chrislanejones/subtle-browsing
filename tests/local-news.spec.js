import { test, expect } from "./helpers/extension.js";

// Publisher structures observed on News4JAX, First Coast News and WESH.
// Fixtures keep real layout behavior without contacting live ad auctions.
const fixture = `<!doctype html><title>Local news ad layouts</title>
<style>
body { margin: 0; }
#siteHeader { position: fixed; top: 0; right: 0; z-index: 10; }
.universal-ad { height: 90px; }
.universal-ad__ad { position: fixed; top: 0; width: 300px; height: 90px; }
.universal-ad__close-button { position: fixed; top: 10px; left: 310px; }
.fixedAd { position: sticky; top: 0; width: 300px; height: 90px; }
#graham { height: 1000px; margin-top: 300px; }
aside { position: sticky; top: 70px; }
.sticky-bottom { position: fixed; bottom: 0; width: 300px; height: 90px; }
.st-adunit-ad { position: fixed; bottom: 0; width: 300px; height: 90px; }
.background-inscreen-display { position: fixed; inset: 0; pointer-events: none; }
[data-type="sticky"] { position: sticky; bottom: 0; }
article { height: 2000px; }
</style>
<header id="siteHeader">News navigation</header>
<div class="universal-ad" data-module="universal-ad">
  <button class="universal-ad__close-button">Close ad</button>
  <div class="universal-ad__ad"><img src="/banner.svg" alt="Top banner"></div>
</div>
<section id="graham"><div id="MileTech_DISPLAY1_DESKTOP" class="fixedAd"><img src="/banner.svg" alt="Sidebar banner"></div></section>
<aside id="adSidebar"><div><div class="adWrapper"><div id="MileTech_PROMO1_DESKTOP" class="fixedAd"><img src="/banner.svg" alt="Sidebar promo"></div></div></div></aside>
<aside id="editorialSidebar"><div><h2>Related stories</h2><div class="adWrapper"><div id="MileTech_PROMO2_DESKTOP" class="fixedAd">Sponsor</div></div></div></aside>
<div id="bottomAd" class="sticky-bottom"><div class="ad-sticky-container">
  <div data-type="sticky"><div data-ad-container="true" data-type="sticky">
    <div class="st-adunit-ad"><img src="/banner.svg" alt="Bottom banner"></div>
    <div class="background-inscreen-display"></div>
  </div></div>
</div></div>
<article>Local news story</article>
<div id="unrelatedBottom" class="sticky-bottom">Reader controls</div>`;

async function openNews(page) {
  await page.route("http://news.example/**", (route) => route.fulfill(
    route.request().url().endsWith("banner.svg")
      ? { contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><rect width="300" height="90" fill="teal"/></svg>' }
      : { contentType: "text/html", body: fixture },
  ));
  await page.goto("http://news.example/");
}

const layout = (page) => page.evaluate(() => Object.fromEntries([
  ".universal-ad", ".universal-ad__ad", ".universal-ad__close-button",
  "#MileTech_DISPLAY1_DESKTOP", "#bottomAd", ".st-adunit-ad", "#siteHeader", "#unrelatedBottom",
  "#adSidebar", "#editorialSidebar",
].map(selector => [selector, getComputedStyle(document.querySelector(selector)).position])));

test("local-news ads and their close button scroll away; banners and navigation survive", async ({ ext, page }) => {
  await openNews(page);
  await expect.poll(() => layout(page)).toEqual({
    ".universal-ad": "relative", ".universal-ad__ad": "absolute", ".universal-ad__close-button": "absolute",
    "#MileTech_DISPLAY1_DESKTOP": "relative", "#bottomAd": "relative", ".st-adunit-ad": "relative",
    "#siteHeader": "fixed", "#unrelatedBottom": "fixed",
    "#adSidebar": "relative", "#editorialSidebar": "sticky",
  });
  await expect(page.locator(".background-inscreen-display")).toBeHidden();
  const selectors = [".universal-ad__ad", ".universal-ad__close-button", "#MileTech_DISPLAY1_DESKTOP", "#adSidebar", "#bottomAd", ".st-adunit-ad"];
  const tops = () => page.evaluate(selectors => selectors.map(s => document.querySelector(s).getBoundingClientRect().top), selectors);
  const before = await tops();
  await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(650);
  const after = await tops();
  after.forEach((top, i) => expect(top).toBeCloseTo(before[i] - 650));
  expect(await page.locator("img").evaluateAll(images => images.every(i => i.complete && i.naturalWidth === 300 && getComputedStyle(i).display !== "none"))).toBe(true);
});

test("disabling pinned ads, site override, and pauses restore publisher positions live", async ({ ext, page }) => {
  await openNews(page);
  await expect.poll(async () => (await layout(page))["#bottomAd"]).toBe("relative");
  for (const state of [
    { settings: { pinnedAds: false } },
    { settings: {}, siteSettings: { "news.example": { pinnedAds: false } } },
    { siteSettings: {}, pausedSites: ["news.example"] },
    { pausedSites: [], pausedEverywhere: true },
  ]) {
    await ext.setSync(state);
    await expect.poll(async () => (await layout(page))["#bottomAd"]).toBe("fixed");
    expect((await layout(page))["#MileTech_DISPLAY1_DESKTOP"]).toBe("sticky");
    expect((await layout(page))[".universal-ad__close-button"]).toBe("fixed");
    expect((await layout(page))["#adSidebar"]).toBe("sticky");
    await expect(page.locator(".background-inscreen-display")).toBeVisible();
  }
  await ext.setSync({ pausedEverywhere: false });
  await expect.poll(async () => (await layout(page))["#bottomAd"]).toBe("relative");
});

test("late-added publisher slots are unpinned without removing their contents", async ({ ext, page }) => {
  await openNews(page);
  await page.locator("#bottomAd").evaluate(el => el.remove());
  await page.evaluate(() => {
    const rail = document.createElement("div");
    rail.id = "lateRail"; rail.className = "sticky-bottom";
    rail.innerHTML = '<div class="ad-sticky-container"><div data-ad-container="true" data-type="sticky">Banner content</div></div>';
    document.body.append(rail);
  });
  await expect(page.locator("#lateRail")).toHaveCSS("position", "relative");
  await expect(page.locator("#lateRail")).toHaveText("Banner content");
  await expect(page.locator("#unrelatedBottom")).toHaveCSS("position", "fixed");
});

test("Pushly SDK blocking follows the notification switch and preserves other CDN resources", async ({ ext, page, context }) => {
  await context.route("https://cdn.p-n.io/**", route => route.fulfill({ contentType: "text/javascript", body: "window.loadedResources = (window.loadedResources || 0) + 1" }));
  await openNews(page);
  const inject = url => page.evaluate(url => new Promise(resolve => {
    const script = document.createElement("script");
    script.onload = () => resolve("loaded"); script.onerror = () => resolve("blocked");
    script.src = url; document.head.append(script);
  }), url);
  expect(await inject("https://cdn.p-n.io/pushly-sdk.min.js?default")).toBe("loaded");
  await ext.setSettings({ notificationRules: true });
  expect(await inject("https://cdn.p-n.io/pushly-sdk.min.js?enabled")).toBe("blocked");
  expect(await inject("https://cdn.p-n.io/other-library.js")).toBe("loaded");
  expect(await inject("https://cdn.p-n.io/pushly-sdk.min.js.backup")).toBe("loaded");
  await ext.setSettings({ notificationRules: false });
  expect(await inject("https://cdn.p-n.io/pushly-sdk.min.js?disabled")).toBe("loaded");
});
