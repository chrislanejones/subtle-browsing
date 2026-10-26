// Playwright fixtures that load the unpacked extension into a fresh Chromium
// profile for every test, so storage, rules and logs never leak between tests.
//
// `channel: "chromium"` is the new headless mode, the only headless mode that
// runs extensions. Every test also fails if any page, frame or extension page
// threw an uncaught error.

import { test as base, expect, chromium } from "@playwright/test";
import { EXTENSION_DIR } from "./env.js";

export { expect };

export const DEFAULT_SETTINGS = {
  videoAdRules: true,
  autoplayGuard: true,
  heavyAds: true,
  annoyanceRules: false,
};

// Errors that are the point of a test (a blocked request) rather than a bug
const EXPECTED_CONSOLE_ERRORS = [/ERR_BLOCKED_BY_CLIENT/, /Failed to load resource/];

export async function launchExtension(profileDir, extensionDir = EXTENSION_DIR, options = {}) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    ...options,
  });
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent("serviceworker");
  return { context, sw, id: new URL(sw.url()).host };
}

// The worker's install work runs in a queue (move to sync, rules, then
// switches); the content scripts are registered last, so their presence
// means the extension is ready
export async function waitForInstall(sw, settings = DEFAULT_SETTINGS) {
  await expect
    .poll(() => registeredScripts(sw), { timeout: 10_000 })
    .toEqual(expectedScripts(settings));
}

export function registeredScripts(sw) {
  return sw.evaluate(async () =>
    (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).sort()
  );
}

export function expectedScripts({ autoplayGuard, heavyAds }) {
  return [
    autoplayGuard && "autoplay-guard",
    "cosmetic",
    (autoplayGuard || heavyAds) && "frame-collapse",
    heavyAds && "heavy-ad-guard",
  ].filter(Boolean);
}

export function expectedRulesets({ videoAdRules, annoyanceRules, notificationRules }) {
  return [annoyanceRules && "annoyances", (notificationRules ?? annoyanceRules) && "notifications", videoAdRules && "video_ads"].filter(Boolean);
}

// The worker turns these block list entries into these URL filters
export function expectedFilters(entries) {
  return entries
    .map((entry) => (/^[\w.-]+$/.test(entry) ? `||${entry}^` : entry))
    .filter((filter) => /^[\x20-\x7e]+$/.test(filter));
}

function makeHelpers(context, sw, id) {
  const helpers = {
    context,
    sw,
    id,
    url: (path) => `chrome-extension://${id}/${path}`,

    getSync: (key) => sw.evaluate((k) => chrome.storage.sync.get(k), key ?? null),
    getLocal: (key) => sw.evaluate((k) => chrome.storage.local.get(k), key ?? null),
    setSync: (items) => sw.evaluate((i) => chrome.storage.sync.set(i), items),
    setLocal: (items) => sw.evaluate((i) => chrome.storage.local.set(i), items),

    dynamicRules: () => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()),
    enabledRulesets: () =>
      sw.evaluate(async () => (await chrome.declarativeNetRequest.getEnabledRulesets()).sort()),
    registeredScripts: () => registeredScripts(sw),
    logUrls: () =>
      sw.evaluate(async () =>
        ((await chrome.storage.local.get("blockedUrlLogs")).blockedUrlLogs ?? []).map((l) => l.url)
      ),

    // Writes the block list the way the UI does and waits for the rules
    async setBlockedUrls(entries) {
      await helpers.setSync({ blockedUrls: entries });
      await expect
        .poll(async () => (await helpers.dynamicRules()).filter((r) => r.action.type === "block").map((r) => r.condition.urlFilter))
        .toEqual(expectedFilters(entries));
    },

    // Writes the switches the way the UI does and waits for them to apply
    async setSettings(changes) {
      const settings = { ...DEFAULT_SETTINGS, ...changes };
      await helpers.setSync({ settings });
      await expect.poll(() => helpers.registeredScripts()).toEqual(expectedScripts(settings));
      await expect.poll(() => helpers.enabledRulesets()).toEqual(expectedRulesets(settings));
      return settings;
    },

    async tabIdOf(page) {
      const url = page.url();
      return sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
    },

    // An extension page to send runtime messages from, as the popup would.
    // The worker can't message itself.
    async messenger() {
      if (!helpers._messenger) {
        helpers._messenger = await context.newPage();
        await helpers._messenger.goto(helpers.url("popup.html"));
      }
      return helpers._messenger;
    },
    async sendMessage(message) {
      const page = await helpers.messenger();
      return page.evaluate((m) => chrome.runtime.sendMessage(m), message);
    },
  };
  return helpers;
}

// Collects uncaught errors from every page and frame, plus console errors
// from extension pages and web pages (other than blocked loads)
export function watchErrors(context) {
  const errors = [];
  context.on("weberror", (webError) => {
    errors.push(`${webError.page()?.url() ?? "?"}: ${webError.error().message}`);
  });
  context.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (EXPECTED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return;
    errors.push(`console (${message.page()?.url() ?? "worker"}): ${text}`);
  });
  return errors;
}

export const test = base.extend({
  // Overrides Playwright's context with a persistent one that has the extension
  context: async ({}, use, testInfo) => {
    const { context } = await launchExtension(testInfo.outputPath("profile"));
    const errors = watchErrors(context);
    await use(context);
    // Read before closing: shutdown cuts off work in progress, which is noise
    const found = [...errors];
    await context.close();
    expect(found, "uncaught errors in pages or the extension").toEqual([]);
  },

  ext: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    sw ??= await context.waitForEvent("serviceworker");
    await waitForInstall(sw);
    // Uncaught worker errors only reach the test as console errors
    await sw.evaluate(() => {
      self.addEventListener("error", (e) => console.error(`Uncaught in worker: ${e.message}`));
      self.addEventListener("unhandledrejection", (e) => console.error(`Unhandled rejection in worker: ${e.reason}`));
    });
    await use(makeHelpers(context, sw, new URL(sw.url()).host));
  },
});

export { makeHelpers };
