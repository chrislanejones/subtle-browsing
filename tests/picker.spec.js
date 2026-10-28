// The element picker (content.js). Started the way the popup and DevTools
// panel start it: a startSelector message from an extension page.

import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { pickerUi } from "./helpers/picker.js";

// Empty corner of #adbox, so the pick is the whole box
const ADBOX = { x: 390, y: 240 };
// The image inside the box's link
const AD_IMAGE = { x: 100 + 20 + 30 + 8, y: 100 + 30 };

async function startPicker(ext, page) {
  const response = await ext.sendMessage({
    action: "startSelector",
    tabId: await ext.tabIdOf(page),
  });
  expect(response).toEqual({ status: "Selector activated" });
  await page.bringToFront();
  await expect.poll(async () => (await pickerUi(page)).shields).toBe(1);
}

const openDialog = async (page) =>
  (await pickerUi(page)).dialogs.find((d) => d.open);

test.describe("element picker", () => {
  test.beforeEach(async ({ ext, page }) => {
    await page.goto(`${FIRST}/picker.html`);
  });

  test("picking a box offers its cross-site domains first and blocks the first one on Enter", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    expect((await pickerUi(page)).toasts).toContain(
      "Element selector activated. Click an element to hide it here or block its source URL. Press Esc to cancel.",
    );

    await page.mouse.move(ADBOX.x, ADBOX.y);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    const dialog = await openDialog(page);
    // The page's own host (127.0.0.1) isn't offered as a domain
    expect(dialog.sections["Whole domain"]).toEqual([
      "ads.example-network.com",
      "localhost",
      "tracker.example-ads.com",
    ]);
    // Every URL in the box, the same-site one too (labels with a port are
    // covered by the known-bug test below)
    expect(dialog.sections["Exact URL"]).toHaveLength(4);
    expect(dialog.sections["Exact URL"]).toEqual(
      expect.arrayContaining([
        "https://ads.example-network.com/click?id=987",
        "https://tracker.example-ads.com/pixel/1",
      ]),
    );
    // The shield is gone while the dialog shows
    expect((await pickerUi(page)).shields).toBe(0);

    // The dialog focuses its first choice, the first whole domain
    await page.keyboard.press("Enter");
    await expect
      .poll(() => ext.getSync("blockedUrls"))
      .toEqual({ blockedUrls: ["ads.example-network.com"] });
    await expect
      .poll(async () => (await pickerUi(page)).toasts)
      .toContain("Blocked: ads.example-network.comUndoDismiss");
    expect(await openDialog(page)).toBeUndefined();
    // And the rule follows
    await expect
      .poll(async () =>
        (await ext.dynamicRules()).map((r) => r.condition.urlFilter),
      )
      .toEqual(["||ads.example-network.com^"]);

    // The click never reached the page
    expect(await page.evaluate(() => window.adClicks)).toBe(0);
  });

  test("clicking a link in picker mode doesn't follow it", async ({
    ext,
    page,
  }) => {
    const navigations = [];
    page.on(
      "framenavigated",
      (frame) => frame === page.mainFrame() && navigations.push(frame.url()),
    );
    await startPicker(ext, page);
    await page.mouse.click(AD_IMAGE.x, AD_IMAGE.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    // Picked the image itself, not the whole box
    const { sections } = await openDialog(page);
    expect(sections["Whole domain"]).toEqual(["localhost"]);
    expect(sections["Exact URL"]).toHaveLength(1);
    await page.waitForTimeout(300);
    expect(navigations).toEqual([]);
    expect(page.url()).toBe(`${FIRST}/picker.html`);
    expect(await page.evaluate(() => window.adClicks)).toBe(0);
  });

  test("Esc while picking cancels and gives the page its clicks back", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await pickerUi(page)).shields).toBe(0);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    expect(await page.evaluate(() => window.adClicks)).toBe(1);
    expect(await openDialog(page)).toBeUndefined();
    expect(await ext.getSync("blockedUrls")).toEqual({});
  });

  test("Esc in the dialog closes it without blocking anything", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect.poll(() => openDialog(page)).toBeUndefined();
    await page.waitForTimeout(300);
    expect(await ext.getSync("blockedUrls")).toEqual({});
    // Once its last toast is gone, nothing of the picker is left in the page
    await expect
      .poll(async () => (await pickerUi(page)).hosts, { timeout: 5000 })
      .toBe(0);
  });

  test("an element without URLs still offers a hide dialog", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    await page.mouse.click(250, 340); // #plain
    await expect.poll(() => openDialog(page)).toBeTruthy();
    expect((await openDialog(page)).sections["Exact URL"]).toEqual([]);
  });

  test("starting twice still gives one picker and one dialog", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    await startPicker(ext, page);
    expect((await pickerUi(page)).hosts).toBe(1);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    expect((await pickerUi(page)).dialogs).toHaveLength(1);
  });

  test("stopSelector turns picking off", async ({ ext, page }) => {
    await startPicker(ext, page);
    const response = await ext.sendMessage({
      action: "stopSelector",
      tabId: await ext.tabIdOf(page),
    });
    expect(response).toEqual({ status: "Selector deactivated" });
    await page.bringToFront();
    expect((await pickerUi(page)).shields).toBe(0);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    expect(await page.evaluate(() => window.adClicks)).toBe(1);
  });

  test("picking an already blocked domain says so", async ({ ext, page }) => {
    await ext.setBlockedUrls(["ads.example-network.com"]);
    await startPicker(ext, page);
    await page.mouse.click(ADBOX.x, ADBOX.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await pickerUi(page)).toasts)
      .toContain("That's already blocked.");
    expect(await ext.getSync("blockedUrls")).toEqual({
      blockedUrls: ["ads.example-network.com"],
    });
  });

  test("an exact URL choice blocks that URL, port and query included", async ({
    ext,
    page,
  }) => {
    await startPicker(ext, page);
    await page.mouse.click(AD_IMAGE.x, AD_IMAGE.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    await page.keyboard.press("Tab"); // from "localhost" to its exact URL
    await page.keyboard.press("Enter");
    const entry = `url:${THIRD}/ad.png?cb=12345`;
    await expect
      .poll(() => ext.getSync("blockedUrls"))
      .toEqual({ blockedUrls: [entry] });
    await expect
      .poll(
        async () =>
          (
            await ext.sw.evaluate(
              (url) =>
                chrome.declarativeNetRequest.testMatchOutcome({
                  url,
                  type: "image",
                }),
              `${THIRD}/ad.png?cb=12345`,
            )
          ).matchedRules.length,
      )
      .toBe(1);
  });

  test("exact URL labels show the port", async ({ ext, page }) => {
    await startPicker(ext, page);
    await page.mouse.click(AD_IMAGE.x, AD_IMAGE.y);
    await expect.poll(() => openDialog(page)).toBeTruthy();
    expect((await openDialog(page)).sections["Exact URL"]).toEqual([
      `${THIRD}/ad.png?cb=12345`,
    ]);
  });
});
