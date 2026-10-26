// Heavy ads, download side: background.js adds up what each third-party
// frame downloads (nested frames count toward the frame under the page) and
// unloads it past 4 MB. CPU-heavy frames are in heavy-ads-cpu.spec.js.
//
// Frames are checked with frame.url() and quietEval, never evaluate():
// a frame the user interacted with is exempt, and evaluate() counts as that.

import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

const HEAVY_NET_LOG = new RegExp(`^Heavy ad \\(5\\.0 MB\\): ${THIRD}/heavy-net\\.html$`);

const frameUnloaded = (page, name) => page.frame({ name })?.url() === "about:blank";
const frameHidden = (page, name) =>
  quietEval(page, (n) => getComputedStyle(document.querySelector(`iframe[name="${n}"]`)).display === "none", name);
// A same-site frame shares the page's process, so the page can read it
const sameSiteText = (page, name, id) =>
  quietEval(page, ([n, i]) => document.querySelector(`iframe[name="${n}"]`).contentDocument?.getElementById(i)?.textContent, [name, id]);

test.describe("heavy ads: downloads", () => {
  test("unloads and collapses a cross-site frame that downloads 5 MB", async ({ ext, page }) => {
    await page.goto(`${FIRST}/heavy-net-page.html`);
    await expect.poll(() => frameUnloaded(page, "netThird")).toBe(true);
    await expect.poll(() => frameHidden(page, "netThird")).toBe(true);
    await expect.poll(() => ext.logUrls()).toEqual([expect.stringMatching(HEAVY_NET_LOG)]);

    // A light third-party frame on the same page is left alone
    expect(frameUnloaded(page, "plainThird")).toBe(false);
    expect(await frameHidden(page, "plainThird")).toBe(false);
  });

  test("keeps a same-site frame that downloads 5 MB", async ({ ext, page }) => {
    await page.goto(`${FIRST}/heavy-net-page.html`);
    // It really got the whole file...
    await expect.poll(() => sameSiteText(page, "netSame", "got")).toBe("5242880");
    // ...and is still there after the cross-site one went
    await expect.poll(() => frameUnloaded(page, "netThird")).toBe(true);
    expect(frameUnloaded(page, "netSame")).toBe(false);
    expect(await frameHidden(page, "netSame")).toBe(false);
  });

  test("counts nested frames toward the frame under the page", async ({ ext, page }) => {
    await page.goto(`${FIRST}/heavy-nest.html`);
    // Two 2.5 MB frames inside one ad frame add up to 5 MB
    await expect.poll(() => frameUnloaded(page, "outer")).toBe(true);
    await expect.poll(() => frameHidden(page, "outer")).toBe(true);
    await expect
      .poll(() => ext.logUrls())
      .toEqual([expect.stringMatching(new RegExp(`^Heavy ad \\(5\\.0 MB\\): ${THIRD}/heavy-nest-outer\\.html$`))]);

    // A lone 2.5 MB frame stays
    const single = page.frame({ name: "single" });
    await expect.poll(() => quietEval(single, () => document.getElementById("got").textContent)).toBe("2621440");
    expect(frameUnloaded(page, "single")).toBe(false);
  });

  test("keeps a cross-site frame the user clicked", async ({ ext, page }) => {
    // Alone on its page: Chrome shares sticky activation between same-origin
    // frames, so a click here would also exempt any other localhost frame
    await page.goto(`${FIRST}/heavy-click.html`);
    const frame = page.frame({ name: "clicked" });
    await frame.click("#go");
    await expect.poll(() => quietEval(frame, () => document.getElementById("got").textContent)).toBe("5242880");
    await page.waitForTimeout(1500);
    expect(frameUnloaded(page, "clicked")).toBe(false);
    expect(await frameHidden(page, "clicked")).toBe(false);
    expect(await ext.logUrls()).toEqual([]);
  });

  test("keeps heavy frames on a paused site", async ({ ext, page }) => {
    await ext.setSync({ pausedSites: ["127.0.0.1"] });
    await expect.poll(async () => (await ext.dynamicRules()).length).toBe(1);
    await page.goto(`${FIRST}/heavy-net-page.html`);
    const netThird = page.frame({ name: "netThird" });
    await expect.poll(() => quietEval(netThird, () => document.getElementById("got").textContent)).toBe("5242880");
    await page.waitForTimeout(1500);
    expect(frameUnloaded(page, "netThird")).toBe(false);
    expect(await ext.logUrls()).toEqual([]);
  });

  test("switched off, a cross-site 5 MB frame is kept", async ({ ext, page }) => {
    await ext.setSettings({ heavyAds: false });
    expect(await ext.registeredScripts()).toEqual(["autoplay-guard", "frame-collapse"]);
    await page.goto(`${FIRST}/heavy-net-page.html`);
    const netThird = page.frame({ name: "netThird" });
    await expect.poll(() => quietEval(netThird, () => document.getElementById("got").textContent)).toBe("5242880");
    await page.waitForTimeout(1500);
    expect(frameUnloaded(page, "netThird")).toBe(false);
    expect(await frameHidden(page, "netThird")).toBe(false);
    expect(await ext.logUrls()).toEqual([]);
  });
});
