import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

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

  for (const target of ["articleText", "play"])
    test(`blocks a click hijack on ${target} without leaving the page`, async ({ ext, page }) => {
      await ext.setSettings({ adRedirectGuard: true });
      const url = `${FIRST}/redirect.html?attack=redirect&to=${encodeURIComponent(away)}`;
      const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a redirect"));
      await page.goto(url);
      await page.click(`#${target}`);
      await stopped;
      expect(page.url()).toBe(url);
      expect(await quietEval(page, () => window.attempted)).toBe(true);
      if (target === "play")
        await expect.poll(() => quietEval(page, () => !document.getElementById("video").paused)).toBe(true);
    });

  for (const attack of ["popup", "blank-popup", "synthetic"])
    test(`blocks ${attack} popunders on a Play click`, async ({ ext, page }) => {
      await ext.setSettings({ adRedirectGuard: true });
      await page.goto(`${FIRST}/redirect.html?attack=${attack}&to=${encodeURIComponent(away)}`);
      const opened = [];
      page.on("popup", (popup) => opened.push(popup));
      const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a popup"));
      await page.click("#play");
      await stopped;
      expect(opened).toHaveLength(0);
      if (attack !== "synthetic") expect(await quietEval(page, () => window.popupBlocked)).toBe(true);
      await expect.poll(() => quietEval(page, () => !document.getElementById("video").paused)).toBe(true);
    });

  test("a hijacked link can't substitute another destination", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    const url = `${FIRST}/redirect.html?attack=redirect&to=${encodeURIComponent(away)}`;
    await page.goto(url);
    await quietEval(page, () => { document.getElementById("link").href = "/index.html"; });
    const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a redirect"));
    await page.click("#link");
    await stopped;
    expect(page.url()).toBe(url);
  });

  test("an external Play control named by aria-labelledby can't authorize a popunder", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?attack=popup&to=${encodeURIComponent(away)}`);
    await quietEval(page, () => {
      const play = document.getElementById("play");
      const label = document.createElement("span");
      label.id = "playLabel";
      label.textContent = "Play";
      play.textContent = "▶";
      play.setAttribute("aria-labelledby", label.id);
      document.body.append(label, play);
    });
    const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a popup"));
    await page.click("#play");
    await stopped;
    expect(await quietEval(page, () => window.popupBlocked)).toBe(true);
    await expect.poll(() => quietEval(page, () => !document.getElementById("video").paused)).toBe(true);
  });

  test("reading keys don't authorize a scripted redirect", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    const url = `${FIRST}/redirect.html?to=${encodeURIComponent(away)}`;
    await page.goto(url);
    await page.keyboard.press("PageDown");
    const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a redirect"));
    await quietEval(page, (to) => { location.href = to; }, away);
    await stopped;
    expect(page.url()).toBe(url);
  });

  test("a scripted Continue button still navigates", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?to=${encodeURIComponent(away)}`);
    await page.click("#continue");
    await page.waitForURL(away);
  });

  for (const target of ["login", "newTab"])
    test(`intentional ${target} popups still open`, async ({ ext, page }) => {
      await ext.setSettings({ adRedirectGuard: true });
      await page.goto(`${FIRST}/redirect.html?to=${encodeURIComponent(away)}`);
      const opened = page.waitForEvent("popup");
      await page.click(`#${target}`);
      const popup = await opened;
      await popup.waitForURL(away);
      await popup.close();
    });

  test("a normal form submission still navigates", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?to=${encodeURIComponent(away)}`);
    await page.locator("#form button").click();
    await page.waitForURL(`${away}?`);
  });

  test("turning the guard off restores popups on the already-open page", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?attack=popup&to=${encodeURIComponent(away)}`);
    await ext.setSettings({ adRedirectGuard: false });
    const opened = page.waitForEvent("popup");
    await page.click("#articleText");
    const popup = await opened;
    await popup.waitForURL(away);
    await popup.close();
  });

  test("keyboard activation of a sign-in button still opens its popup", async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/redirect.html?to=${encodeURIComponent(away)}`);
    await page.focus("#login");
    const opened = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    const popup = await opened;
    await popup.waitForURL(away);
    await popup.close();
  });
});
