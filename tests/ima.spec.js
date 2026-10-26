// Google IMA stand-in: rules/video-ads.json redirects the IMA SDK to
// stubs/ima3.js, which answers every ad request with "no ad" (error 1009).
// The redirect happens before any network request, so no internet is needed.

import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

for (const [page, file] of [
  ["ima.html", "ima3.js"],
  ["ima-debug.html", "ima3_debug.js"],
]) {
  test(`${file} is redirected to the stand-in, which answers "no ad"`, async ({ ext, page: tab }) => {
    const redirects = [];
    tab.on("request", (request) => {
      if (request.redirectedFrom()?.url().startsWith("https://imasdk.googleapis.com/")) {
        redirects.push({ from: request.redirectedFrom().url(), to: request.url() });
      }
    });

    await tab.goto(`${FIRST}/${page}`);
    await expect.poll(() => tab.evaluate(() => window.result.events)).toEqual(["adError:1009"]);
    // Give a stray ADS_MANAGER_LOADED time to show up
    await tab.waitForTimeout(300);
    const result = await tab.evaluate(() => window.result);
    expect(result).toEqual({
      version: "3.0.0",
      events: ["adError:1009"], // never adsManagerLoaded
      late: ["adError"], // a listener added right after requestAds still hears it
      contexts: [{ slot: "preroll" }],
    });

    expect(redirects).toEqual([
      {
        from: `https://imasdk.googleapis.com/js/sdkloader/${file}`,
        // use_dynamic_url: a per-session ID, so pages can't fingerprint the extension
        to: expect.stringMatching(/^chrome-extension:\/\/[0-9a-f-]{36}\/stubs\/ima3\.js$/),
      },
    ]);
    expect(redirects[0].to).not.toContain(ext.id);
  });
}

test("the stand-in's error looks like IMA's own 'no ad' error", async ({ ext, page }) => {
  await page.goto(`${FIRST}/ima.html`);
  const error = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const loader = new google.ima.AdsLoader(new google.ima.AdDisplayContainer(document.body));
        loader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (event) => {
          const e = event.getError();
          resolve({
            code: e.getErrorCode(),
            vast: e.getVastErrorCode(),
            type: e.getType(),
            message: e.getMessage(),
            eventType: event.type,
            // Enum lookups players do before comparing
            started: google.ima.AdEvent.Type.STARTED,
            sdkVersion: loader.getVersion(),
            locale: loader.getSettings().getLocale(),
          });
        });
        loader.requestAds(new google.ima.AdsRequest());
      })
  );
  expect(error).toEqual({
    code: 1009,
    vast: 303,
    type: "adLoadError",
    message: "No ads available",
    eventType: "adError",
    started: "started",
    sdkVersion: "3.0.0",
    locale: "en",
  });
});

test("with the video ad list off, the real SDK URL is requested as is", async ({ ext, page }) => {
  await ext.setSettings({ videoAdRules: false });
  // Stand in for Google's server so the test needs no internet
  await page.route("https://imasdk.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "window.fromGoogle = true;" })
  );
  await page.goto(`${FIRST}/ima.html`);
  expect(await page.evaluate(() => ({ fromGoogle: window.fromGoogle, version: window.result.version }))).toEqual({
    fromGoogle: true,
    version: undefined,
  });
});
