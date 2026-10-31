import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

const playing = (page) => quietEval(page, () => {
  const video = document.getElementById("video");
  return !video.paused && video.currentTime > 0.15;
});
for (const mode of ["cross", "same", "srcdoc", "blank", "nested"])
  test(`a trusted ${mode}-frame Play control starts its parent player`, async ({ ext, page }) => {
    await ext.setSettings({ adRedirectGuard: true });
    await page.goto(`${FIRST}/frame-controls.html?${mode}`);
    const frame = page.frameLocator("#controls");
    const control = mode === "nested" ? frame.frameLocator("iframe") : frame;
    await control.locator("#play").click();
    await expect.poll(() => playing(page)).toBe(true);
    expect(await quietEval(page, () => document.getElementById("unrelated").paused)).toBe(true);
  });

test("keyboard Play inside a child frame also works", async ({ ext, page }) => {
  await page.goto(`${FIRST}/frame-controls.html`);
  await page.frameLocator("#controls").locator("#play").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => playing(page)).toBe(true);
});

for (const mode of ["article", "outside", "synthetic", "forged"])
  test(`${mode} frame activity does not authorize parent autoplay`, async ({ ext, page }) => {
    await page.goto(`${FIRST}/frame-controls.html?${mode}`);
    const frame = page.frameLocator("#controls");
    if (mode === "synthetic" || mode === "forged") {
      await frame.locator("#article").focus();
      await page.keyboard.press("PageDown");
      const child = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
      await quietEval(child, (kind) => {
        if (kind === "forged") parent.postMessage({ type: "subtle:frame-gesture", kind: "play", token: "fake" }, "*");
        document.getElementById("play").click();
      }, mode);
    } else await frame.locator(mode === "article" ? "#article" : "#play").click();
    await expect.poll(() => quietEval(page, () => window.finished)).toBe(true);
    expect(await quietEval(page, () => document.getElementById("video").paused)).toBe(true);
  });

for (const frameType of ["cross", "same", "srcdoc", "blank"])
  for (const attack of ["popup", "blank", "synthetic"])
    test(`${frameType} frame cannot open a ${attack} popunder from Play`, async ({ ext, page, context }) => {
      await ext.setSettings({ adRedirectGuard: true });
      await page.goto(`${FIRST}/frame-controls.html?${frameType}&attack=${attack}`);
      const opened = [];
      context.on("page", (page) => opened.push(page));
      const stopped = page.waitForEvent("console", { predicate: (message) => message.text().startsWith("Subtle stopped a popup"), timeout: 8000 });
      await page.frameLocator("#controls").locator("#play").click();
      await stopped;
      await expect.poll(() => playing(page)).toBe(true);
      expect(opened).toHaveLength(0);
    });

test("intentional iframe sign-in popups and normal embedded navigation still work", async ({ ext, page, context }) => {
  await ext.setSettings({ adRedirectGuard: true });
  await page.goto(`${FIRST}/frame-controls.html`);
  const opened = context.waitForEvent("page", { timeout: 10000 });
  await page.frameLocator("#controls").locator("#login").click();
  await expect.poll(() => quietEval(page, () => window.loginReport)).toEqual({ active: true, blocked: false });
  const popup = await opened;
  await popup.waitForURL(`${FIRST}/index.html`);
  await popup.close();
  const child = page.frame({ url: `${THIRD}/frame-control.html?` });
  await quietEval(child, (url) => { location.href = url; }, `${FIRST}/index.html`);
  await expect(page.frameLocator("#controls").locator("body")).toContainText("Test page");
});

test("a site exception also turns off its child-frame popup guard", async ({ ext, page }) => {
  await ext.setSettings({ adRedirectGuard: true });
  await ext.setSync({ siteSettings: { "127.0.0.1": { adRedirectGuard: false } } });
  await page.goto(`${FIRST}/frame-controls.html?attack=popup`);
  const opened = page.waitForEvent("popup");
  await page.frameLocator("#controls").locator("#article").click();
  const popup = await opened;
  await popup.waitForURL(`${FIRST}/index.html`);
  await popup.close();
});
