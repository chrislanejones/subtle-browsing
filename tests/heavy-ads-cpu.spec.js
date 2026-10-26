// Heavy ads, CPU side: heavy-ad-guard.js unloads a third-party frame after
// 5 s of long tasks within 30 s. These frames peg a core, so the config runs
// this file after everything else, one test at a time.

import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

const frameUnloaded = (page, name) => page.frame({ name })?.url() === "about:blank";
const frameHidden = (page, name) =>
  quietEval(page, (n) => getComputedStyle(document.querySelector(`iframe[name="${n}"]`)).display === "none", name);

test.describe("heavy ads: CPU", () => {
  test("unloads a busy cross-site frame within about 10 s, keeps a busy same-site one", async ({ ext, page }) => {
    await page.goto(`${FIRST}/heavy-cpu-page.html`);
    const started = Date.now();
    await expect.poll(() => frameUnloaded(page, "cpuThird"), { timeout: 15_000, intervals: [250] }).toBe(true);
    const seconds = (Date.now() - started) / 1000;
    expect(seconds).toBeGreaterThan(4); // it waited for 5 s of busy time
    expect(seconds).toBeLessThan(12);
    await expect.poll(() => frameHidden(page, "cpuThird")).toBe(true);
    await expect
      .poll(() => ext.logUrls())
      .toEqual([expect.stringMatching(new RegExp(`^Heavy ad \\(\\d+\\.\\ds of CPU\\): ${THIRD}/heavy-cpu\\.html$`))]);

    // The same-site frame kept running all along
    expect(frameUnloaded(page, "cpuSame")).toBe(false);
    expect(await frameHidden(page, "cpuSame")).toBe(false);
    const ticks = await quietEval(page, () =>
      Number(document.querySelector('iframe[name="cpuSame"]').contentDocument.getElementById("ticks").textContent)
    );
    expect(ticks).toBeGreaterThan(10);
  });

  test("switched off, busy and heavy cross-site frames are kept", async ({ ext, page }) => {
    await ext.setSettings({ heavyAds: false });
    await page.goto(`${FIRST}/heavy-all.html`);
    // Past the point where the CPU rule would have fired
    await page.waitForTimeout(10_000);
    expect(frameUnloaded(page, "cpuThird")).toBe(false);
    expect(frameUnloaded(page, "netThird")).toBe(false);
    expect(await frameHidden(page, "cpuThird")).toBe(false);
    expect(await frameHidden(page, "netThird")).toBe(false);
    const ticks = await quietEval(page.frame({ name: "cpuThird" }), () =>
      Number(document.getElementById("ticks").textContent)
    );
    expect(ticks).toBeGreaterThan(20);
    expect(await ext.logUrls()).toEqual([]);
  });
});
