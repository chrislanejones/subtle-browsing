import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const dir = resolve(".");
const context = await chromium.launchPersistentContext("", {
  headless: true,
  channel: "chromium",
  args: [
    `--disable-extensions-except=${dir}`,
    `--load-extension=${dir}`,
    "--auto-open-devtools-for-tabs",
  ],
});
try {
  const sw =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto("https://example.com");
  await page.waitForTimeout(1500);
  await mkdir("artifacts/ui", { recursive: true });
  const result = await sw.evaluate(async () => {
    try {
      await chrome.action.openPopup();
      return "opened";
    } catch (e) {
      return e.message;
    }
  });
  console.log("popup:", result);
  console.log(
    "pages",
    context.pages().map((p) => p.url()),
  );
  const browser = await context.newCDPSession(page);
  console.log(
    "targets",
    (await browser.send("Target.getTargets")).targetInfos.map((t) => ({
      id: t.targetId,
      type: t.type,
      url: t.url,
    })),
  );
  // Extension page previews remain reproducible even without a visible toolbar.
  for (const name of ["popup", "panel", "options"]) {
    const ui = await context.newPage();
    await ui.setViewportSize({
      width: name === "popup" ? 360 : 1000,
      height: 800,
    });
    await ui.goto(`chrome-extension://${id}/${name}.html`);
    if (name === "panel") await ui.locator("#globalControls summary").click();
    await ui.screenshot({
      path: `artifacts/ui/${name}.png`,
      fullPage: true,
      timeout: 10000,
    });
  }
} finally {
  await context.close();
}
