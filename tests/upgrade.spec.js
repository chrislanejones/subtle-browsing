// 1.5.0 moved the block list, paused sites and switches from storage.local to
// storage.sync. These tests install a copy of the extension labeled 1.4.0,
// leave 1.4.0-style data in local storage, then update the copy to 1.5.0 in
// the same profile, the way Chrome updates an installed extension.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXTENSION_DIR } from "./helpers/env.js";
import { DEFAULT_SETTINGS, expectedRulesets, launchExtension, setBadgeWindow, waitForInstall, watchErrors } from "./helpers/extension.js";

async function copyExtension(target) {
  const files = execFileSync("git", ["ls-files"], { cwd: EXTENSION_DIR, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const file of files) {
    await mkdir(dirname(join(target, file)), { recursive: true });
    await copyFile(join(EXTENSION_DIR, file), join(target, file));
  }
}

async function setVersion(extensionDir, version) {
  const path = join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.version = version;
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

const today = () => new Date().toLocaleDateString("en-CA");

// Installs "1.4.0", writes `local` and `sync`, updates to 1.5.0 and hands the
// relaunched worker to `check`
async function upgrade(testInfo, { local, sync = {}, settingsAfter }, check) {
  const extensionDir = testInfo.outputPath("extension");
  const profileDir = testInfo.outputPath("profile");
  await copyExtension(extensionDir);
  await setVersion(extensionDir, "1.4.0");

  {
    const { context, sw } = await launchExtension(profileDir, extensionDir);
    const errors = watchErrors(context);
    await waitForInstall(sw);
    expect(await sw.evaluate(() => chrome.runtime.getManifest().version)).toBe("1.4.0");
    await sw.evaluate(
      ([l, s]) => Promise.all([chrome.storage.local.set(l), chrome.storage.sync.set(s)]),
      [local, sync]
    );
    // Let the worker finish applying what landed in sync before closing
    await waitForInstall(sw, { ...DEFAULT_SETTINGS, ...sync.settings });
    const ruleCount = (sync.blockedUrls?.length ?? 0) + (sync.pausedSites?.length ? 1 : 0);
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).length))
      .toBe(ruleCount);
    const found = [...errors];
    await context.close();
    expect(found).toEqual([]);
  }

  await setVersion(extensionDir, "1.5.0");

  const { context, sw } = await launchExtension(profileDir, extensionDir);
  const errors = watchErrors(context);
  let found = [];
  try {
    await waitForInstall(sw, settingsAfter);
    expect(await sw.evaluate(() => chrome.runtime.getManifest().version)).toBe("1.5.0");
    await check(sw);
  } finally {
    found = [...errors]; // before closing, which cuts off work in progress
    await context.close();
  }
  expect(found).toEqual([]);
}

const ruleSummary = (sw) =>
  sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => [
      r.action.type,
      r.condition.urlFilter ?? r.condition.requestDomains,
    ])
  );

test("updating from 1.4.0 moves local settings to sync and rebuilds the rules", async ({}, testInfo) => {
  const oldSettings = { ...DEFAULT_SETTINGS, annoyanceRules: true, heavyAds: false };
  const local = {
    blockedUrls: ["old.example"],
    pausedSites: ["paused-here.example"],
    settings: oldSettings,
    blockedToday: { date: today(), count: 3 },
    blockedUrlLogs: [{ timestamp: new Date().toISOString(), url: "https://old.example/ad.js" }],
  };

  await upgrade(testInfo, { local, settingsAfter: oldSettings }, async (sw) => {
    expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual({
      blockedUrls: ["old.example"],
      pausedSites: ["paused-here.example"],
      settings: oldSettings,
    });
    // Moved keys are gone from local; the daily count and log stay there
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toEqual({
      blockedToday: local.blockedToday,
      blockedUrlLogs: local.blockedUrlLogs,
    });

    // Rules and switches rebuilt from the moved data
    expect(await ruleSummary(sw)).toEqual([
      ["block", "||old.example^"],
      ["allowAllRequests", ["paused-here.example"]],
    ]);
    expect((await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).sort()).toEqual(
      expectedRulesets(oldSettings)
    );
    await setBadgeWindow(sw, true);
    await expect.poll(() => sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("3");
  });
});

test("on a second computer, lists are merged and the synced switches win", async ({}, testInfo) => {
  const syncedSettings = { ...DEFAULT_SETTINGS, autoplayGuard: false };
  const local = {
    blockedUrls: ["shared.example", "old.example"],
    pausedSites: ["paused-here.example"],
    settings: { ...DEFAULT_SETTINGS, annoyanceRules: true },
  };
  const sync = {
    blockedUrls: ["synced.example", "shared.example"],
    pausedSites: ["from-sync.example"],
    settings: syncedSettings,
  };

  await upgrade(testInfo, { local, sync, settingsAfter: syncedSettings }, async (sw) => {
    expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual({
      blockedUrls: ["synced.example", "shared.example", "old.example"],
      pausedSites: ["from-sync.example", "paused-here.example"],
      settings: syncedSettings,
    });
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toEqual({});
    expect(await ruleSummary(sw)).toEqual([
      ["block", "||synced.example^"],
      ["block", "||shared.example^"],
      ["block", "||old.example^"],
      ["allowAllRequests", ["from-sync.example", "paused-here.example"]],
    ]);
    expect((await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).sort()).toEqual(["video_ads"]);
  });
});
