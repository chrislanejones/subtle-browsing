import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

const PAUSED_SITES_RULE_ID = 1_000_000;

// quietEval: a Playwright evaluate() would count as a click and let autoplay run
const probe = (page) =>
  quietEval(page, () => {
    const img = document.getElementById("adimg");
    const video = document.getElementById("mutedAuto");
    return { adLoaded: img.complete && img.naturalWidth > 0, videoPlaying: !video.paused, triedToPlay: window.plays > 0 };
  });

// Sends the popup's message and waits for the reload it causes
async function pauseSite(ext, page, paused) {
  const tabId = await ext.tabIdOf(page);
  const reloaded = page.waitForEvent("load");
  const response = await ext.sendMessage({ action: "pauseSite", site: "127.0.0.1", paused, tabId });
  expect(response).toEqual({ ok: true });
  await reloaded;
}

test("pausing a site lets blocked requests and autoplay through, unpausing restores both", async ({ ext, page }) => {
  await ext.setBlockedUrls(["localhost"]);
  await page.goto(`${FIRST}/pause.html`);
  // Muted autoplay tries to play and gets paused; the third-party image is blocked
  await expect.poll(() => probe(page)).toEqual({ adLoaded: false, videoPlaying: false, triedToPlay: true });

  await quietEval(page, () => (window.beforePause = true));
  await pauseSite(ext, page, true);
  expect(await quietEval(page, () => window.beforePause)).toBeUndefined(); // the tab really reloaded

  expect(await ext.getSync("pausedSites")).toEqual({ pausedSites: ["127.0.0.1"] });
  const allow = (await ext.dynamicRules()).find((r) => r.id === PAUSED_SITES_RULE_ID);
  expect(allow).toMatchObject({
    priority: 10,
    action: { type: "allowAllRequests" },
    condition: { requestDomains: ["127.0.0.1"], resourceTypes: ["main_frame", "sub_frame"] },
  });
  await expect.poll(() => probe(page)).toEqual({ adLoaded: true, videoPlaying: true, triedToPlay: true });

  await pauseSite(ext, page, false);
  expect(await ext.getSync("pausedSites")).toEqual({ pausedSites: [] });
  expect((await ext.dynamicRules()).map((r) => r.id)).toEqual([1]);
  await expect.poll(() => probe(page)).toEqual({ adLoaded: false, videoPlaying: false, triedToPlay: true });
});

test("allowed requests on a paused site aren't counted as blocks", async ({ ext, page }) => {
  await ext.setBlockedUrls(["localhost"]);
  await ext.setSync({ pausedSites: ["127.0.0.1"] });
  await expect.poll(async () => (await ext.dynamicRules()).length).toBe(2);
  await page.goto(`${FIRST}/pause.html`);
  await expect.poll(() => probe(page)).toMatchObject({ adLoaded: true });
  // Give the batched log time to flush if anything had been logged
  await page.waitForTimeout(1500);
  expect(await ext.logUrls()).toEqual([]);
  expect(await ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
});
