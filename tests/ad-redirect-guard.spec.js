import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";

// An ad frame on FIRST (127.0.0.1) tries to send the tab to THIRD (localhost)
const adPage = (to) => `${FIRST}/redirect.html?ad&to=${encodeURIComponent(to)}`;
const away = `${THIRD}/index.html`;

// Gives the ad frame's half-second timer time to fire
const settle = (page) => page.waitForTimeout(1500);

test.describe("stop ad redirects", () => {
  test("is off by default, so an ad can send the tab away", async ({ ext, page }) => {
    expect(await ext.registeredScripts()).not.toContain("ad-redirect-guard");
    await page.goto(adPage(away));
    await page.waitForURL(away);
  });

  test("on, an ad frame can't send the tab to another site", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a redirect"));
    await page.goto(adPage(away));
    await settle(page);
    expect(page.url()).toBe(adPage(away));
    expect((await stopped).text()).toBe(`Subtle stopped a redirect to ${THIRD}`);
  });

  test("a click on a link still goes to another site", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?to=${encodeURIComponent(away)}`);
    await page.click("#link");
    await page.waitForURL(away);
  });

  test("a redirect within the same site goes through", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(adPage(`${FIRST}/index.html`));
    await page.waitForURL(`${FIRST}/index.html`);
  });

  test("a site turned off is left alone", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await ext.setSync({ siteSettings: { "127.0.0.1": { adRedirectGuard: false } } });
    await page.goto(adPage(away));
    await page.waitForURL(away);
  });
});
