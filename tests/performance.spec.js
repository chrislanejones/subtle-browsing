// Worst-case pages must not stall the page's main thread: no long task
// (over 50 ms) while the extension deals with them. The page records long
// tasks itself with a PerformanceObserver. The config runs this file after
// everything else, one test at a time, so other tests can't add noise.

import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";
import { pickerUi } from "./helpers/picker.js";

// Loads the stress page and forgets the long task from building 20k elements
async function openStressPage(page) {
  await page.goto(`${FIRST}/stress.html`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  await quietEval(page, () => (window.longTasks.length = 0));
}

const longTasks = (page) => quietEval(page, () => window.longTasks);

async function startPicker(ext, page) {
  const response = await ext.sendMessage({ action: "startSelector", tabId: await ext.tabIdOf(page) });
  expect(response).toEqual({ status: "Selector activated" });
  await page.bringToFront();
}

test.describe("performance guard", () => {
  test("a player that restarts itself is stopped without a busy loop", async ({ ext, page }) => {
    await page.goto(`${FIRST}/stress.html`);
    // quietEval only: a Playwright evaluate() would count as a click and let it play
    await expect.poll(() => quietEval(page, () => window.playEvents)).toBeGreaterThanOrEqual(4);
    const settled = await quietEval(page, () => window.playEvents);
    await quietEval(page, () => (window.longTasks.length = 0));
    await page.waitForTimeout(2000);
    expect(await quietEval(page, () => window.playEvents)).toBe(settled);
    expect(settled).toBeLessThanOrEqual(5);
    expect(await quietEval(page, () => document.getElementById("pingpong").networkState)).toBe(0); // unloaded
    expect(await longTasks(page)).toEqual([]);
  });

  test("300 fast mouse moves over 20,000 elements with the picker on", async ({ ext, page }) => {
    await openStressPage(page);
    await startPicker(ext, page);
    const box = await quietEval(page, () => {
      const { left, top, width, height } = document.getElementById("grid").getBoundingClientRect();
      return { left, top, width, height };
    });
    await quietEval(page, () => (window.longTasks.length = 0));
    for (let i = 0; i < 300; i++) {
      const x = box.left + ((i * 37) % box.width);
      const y = box.top + ((i * 53) % box.height);
      await page.mouse.move(x, y);
    }
    await page.waitForTimeout(500);
    expect(await longTasks(page)).toEqual([]);
    // The picker was really on the whole time
    expect((await pickerUi(page)).shields).toBe(1);
  });

  test("picking a container of 20,000 elements", async ({ ext, page }) => {
    await openStressPage(page);
    await startPicker(ext, page);
    const corner = await quietEval(page, () => {
      const { left, top } = document.getElementById("huge").getBoundingClientRect();
      return { x: left + 5, y: top + 5 }; // the padding, so #huge itself is picked
    });
    await quietEval(page, () => (window.longTasks.length = 0));
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(1000);
    // Read the long tasks first: inspecting the picker UI walks the whole DOM
    expect(await longTasks(page)).toEqual([]);

    const dialog = (await pickerUi(page)).dialogs.find((d) => d.open);
    expect(dialog.sections["Whole domain"]).toEqual(["ads.example-network.com"]);
    // Only the first 2,000 elements are scanned: 20 data- URLs and 40 backgrounds
    expect(dialog.sections["Exact URL"]).toHaveLength(60);
  });
});
